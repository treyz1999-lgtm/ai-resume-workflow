import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { advance } from "@/lib/status";
import { lastKnownTimeZone } from "@/lib/time-zone";
import { googleFetch } from "./account";
import { googleUrl } from "./endpoints";
import { readMessage, type ReadMail } from "./gmail";
import { stripQuoted } from "./mime";
import { classifyStatus } from "./status-report-analysis";
import { localDay, matchingAttempts, reportingWindow, statusForKind, validateStatusEvidence, type StatusCandidate } from "./status-report-rules";
import type { StatusClassification, StatusMailContext } from "./status-report-task";

const api = (path: string) => googleUrl("gmail", "/gmail/v1/users/me" + path);
type MailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string }; parts?: MailPart[] };
type RawMail = { id: string; internalDate?: string; payload: MailPart };
async function hydrate(part: MailPart, messageId: string): Promise<void> {
  if (!part.filename && /^text\/(plain|html)$/.test(part.mimeType ?? "") && part.body?.attachmentId && !part.body.data) {
    const body = await googleFetch<{ data: string }>("read", api("/messages/" + encodeURIComponent(messageId) + "/attachments/" + encodeURIComponent(part.body.attachmentId)));
    part.body.data = body.data;
  }
  for (const child of part.parts ?? []) await hydrate(child, messageId);
}
function hasBody(part: MailPart): boolean {
  return (!part.filename && /^text\/(plain|html)$/.test(part.mimeType ?? "") && typeof part.body?.data === "string") ||
    (part.parts ?? []).some(hasBody);
}
async function threadMessages(threadId: string): Promise<ReadMail[]> {
  const raw = await googleFetch<{ messages?: RawMail[] }>("read", api("/threads/" + encodeURIComponent(threadId) + "?format=full"));
  const messages: ReadMail[] = [];
  for (const message of raw.messages ?? []) {
    await hydrate(message.payload, message.id);
    if (!message.internalDate || !Number.isFinite(Number(message.internalDate)) || !hasBody(message.payload)) {
      throw new ActionError("A complete dated email body was unavailable. This thread is retained for retry.");
    }
    messages.push(readMessage(message));
  }
  return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
}
async function candidates(): Promise<StatusCandidate[]> {
  const apps = await prisma.application.findMany({
    where: { awaitingReview: false, sentAt: { not: null } },
    select: { id: true, company: true, role: true, sentAt: true },
  });
  return apps.map(app => ({ ...app, sentAt: app.sentAt?.toISOString() ?? null }));
}
type Tx = Prisma.TransactionClient;
async function applyFinding(tx: Tx, findingId: string, applicationId: string) {
  await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${applicationId} FOR UPDATE`;
  const finding = await tx.emailStatusFinding.findUniqueOrThrow({ where: { id: findingId } });
  const app = await tx.application.findUnique({ where: { id: applicationId }, include: { events: { orderBy: { at: "desc" }, take: 1 } } });
  if (!app?.sentAt || app.awaitingReview || app.sentAt > finding.emailDate) throw new ActionError("Choose an application submitted before this email.");
  const newer = await tx.emailStatusFinding.findFirst({ where: { applicationId, result: { in: ["APPLIED", "UNCHANGED"] }, emailDate: { gte: finding.emailDate }, id: { not: finding.id } } });
  if (newer || (app.events[0] && app.events[0].at > finding.emailDate)) {
    await tx.emailStatusFinding.update({ where: { id: findingId }, data: { applicationId, result: "STALE" } });
    return;
  }
  const to = statusForKind[finding.kind as StatusClassification["kind"]];
  const change = to ? advance(app, to, finding.emailDate) : null;
  const tracker = app.trackerCsv && typeof app.trackerCsv === "object" && !Array.isArray(app.trackerCsv) ? app.trackerCsv : {};
  const evidence = finding.evidence as { timeZone?: string };
  const date = localDay(finding.emailDate, evidence.timeZone ?? "UTC");
  await tx.application.update({ where: { id: app.id }, data: {
    ...change?.update,
    trackerCsv: { ...tracker, response_date: date, ...(finding.kind === "REJECTION" ? { rejection_date: date } : {}),
      ...(finding.kind === "ASSESSMENT" ? { interview_stage: "Assessment" } : {}) },
  } });
  if (change) await tx.statusEvent.create({ data: { applicationId, ...change.event } });
  await tx.emailStatusFinding.update({ where: { id: findingId }, data: { applicationId, result: change ? "APPLIED" : "UNCHANGED" } });
}

export async function resolveStatusFinding(id: string, applicationId: string | null) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EmailStatusFinding" WHERE id = ${id} FOR UPDATE`;
    const finding = await tx.emailStatusFinding.findUniqueOrThrow({ where: { id } });
    if (!["REVIEW", "NO_MATCH"].includes(finding.result)) return;
    if (!applicationId) {
      await tx.emailStatusFinding.update({ where: { id }, data: { result: "DISMISSED" } });
      return;
    }
    await applyFinding(tx, id, applicationId);
  });
}
export async function loadStatusFindings() {
  const rows = await prisma.emailStatusFinding.findMany({ orderBy: [{ emailDate: "desc" }, { id: "desc" }] });
  return rows.map(row => ({ ...row, candidates: row.candidates as unknown as StatusCandidate[] }));
}
export type StatusCheckSummary = { reviewed: number; included: number; updated: number; review: number; warnings: string[] };
let active: Promise<StatusCheckSummary> | undefined;
export function checkStatusUpdates(): Promise<StatusCheckSummary> {
  active ??= runCheck().finally(() => { active = undefined; });
  return active;
}
async function runCheck(): Promise<StatusCheckSummary> {
  const summary: StatusCheckSummary = { reviewed: 0, included: 0, updated: 0, review: 0, warnings: [] };
  const timeZone = await lastKnownTimeZone();
  const window = reportingWindow(new Date(), timeZone);
  const query = window.query + " -in:spam -in:trash -in:sent {application candidacy interview scheduling recruiter \"hiring team\" assessment \"next steps\" offer unfortunately regret \"position closed\" withdrawal}";
  const threads = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = new URL(api("/messages"));
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await googleFetch<{ messages?: { threadId: string }[]; nextPageToken?: string }>("read", url);
    for (const message of page.messages ?? []) threads.add(message.threadId);
    pageToken = page.nextPageToken;
    if (threads.size > 500) throw new ActionError("More than 500 candidate threads matched. No updates were applied. Narrow the mailbox search before retrying.");
  } while (pageToken);
  const contexts: { mail: ReadMail; context: StatusMailContext }[] = [];
  for (const threadId of threads) {
    try {
      const messages = await threadMessages(threadId);
      for (const mail of messages) {
        const day = localDay(mail.date, timeZone);
        if (day < window.start || day > window.end || mail.labels.some(label => ["SENT", "SPAM", "TRASH", "DRAFT"].includes(label))) continue;
        contexts.push({ mail, context: { targetId: mail.id, messages: messages.filter(message => message.date <= mail.date).map(message => ({
          id: message.id, from: message.from, subject: message.subject, date: message.date.toISOString(), text: message.text,
        })) } });
      }
    } catch { summary.warnings.push("A thread could not be read in full. Retry the check to include it."); }
  }
  contexts.sort((a, b) => a.mail.date.getTime() - b.mail.date.getTime());
  const apps = await candidates();
  for (const { mail, context } of contexts) {
    if (await prisma.emailStatusFinding.findUnique({ where: { messageId: mail.id } })) continue;
    try {
      summary.reviewed++;
      const result = await classifyStatus(context);
      validateStatusEvidence(result, context);
      if (result.kind === "IGNORE") continue;
      const matches = matchingAttempts(result, apps, mail.date);
      const fingerprint = createHash("sha256").update(JSON.stringify([result.company.toLowerCase(), result.role.toLowerCase(), result.kind, stripQuoted(mail.text).replace(/\s+/g, " ").trim()])).digest("hex");
      const duplicate = await prisma.emailStatusFinding.findFirst({ where: { evidence: { path: ["fingerprint"], equals: fingerprint } } });
      if (duplicate) continue;
      const saved = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7160001)`;
        if (await tx.emailStatusFinding.findUnique({ where: { messageId: mail.id } })) return null;
        if (await tx.emailStatusFinding.findFirst({ where: { evidence: { path: ["fingerprint"], equals: fingerprint } } })) return null;
        const finding = await tx.emailStatusFinding.create({ data: {
          messageId: mail.id, threadId: mail.threadId, emailDate: mail.date, company: result.company, role: result.role,
          summary: result.summary, kind: result.kind, candidates: matches,
          evidence: { quote: result.quote, companyQuote: result.companyQuote, roleQuote: result.roleQuote, fingerprint, timeZone },
          result: matches.length ? "REVIEW" : "NO_MATCH",
        } });
        if (matches.length === 1 && result.confident && result.role && result.company) await applyFinding(tx, finding.id, matches[0].id);
        return tx.emailStatusFinding.findUniqueOrThrow({ where: { id: finding.id } });
      });
      if (saved) {
        summary.included++;
        if (saved.result === "APPLIED") summary.updated++;
        if (["REVIEW", "NO_MATCH"].includes(saved.result)) summary.review++;
      }
    } catch (error) {
      summary.warnings.push(error instanceof ActionError ? error.message : "A candidate email could not be classified or saved. Retry to include it.");
      break;
    }
  }
  return summary;
}
