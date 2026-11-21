import type { ApplicationStatus } from "@/generated/prisma/enums";
import { stripQuoted } from "./mime";
import type { StatusClassification, StatusMailContext } from "./status-report-task";

export const statusForKind: Partial<Record<StatusClassification["kind"], ApplicationStatus>> = {
  REJECTION: "REJECTED", INTERVIEW: "INTERVIEW", ASSESSMENT: "INTERVIEW", OFFER: "OFFER", WITHDRAWAL: "DECLINED",
};
export const normalizeIdentity = (s: string) => s.toLowerCase().replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const folded = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export function validateStatusEvidence(result: StatusClassification, context: StatusMailContext) {
  if (result.kind === "IGNORE") return;
  const target = context.messages.find(message => message.id === context.targetId);
  const fresh = folded(stripQuoted(target?.text ?? ""));
  if (!result.quote.trim() || !fresh.includes(folded(result.quote))) throw new Error("The status finding was not supported by the current message.");
  const full = folded(context.messages.map(message => message.subject + "\n" + message.text).join("\n"));
  for (const [identity, quote] of [[result.company, result.companyQuote], [result.role, result.roleQuote]]) {
    if (identity && (!quote || !full.includes(folded(quote)) || !normalizeIdentity(quote).includes(normalizeIdentity(identity)))) {
      throw new Error("The status finding's company or role was not supported by the thread.");
    }
  }
}
export type StatusCandidate = { id: string; company: string; role: string; sentAt: string | null };
export function matchingAttempts(result: StatusClassification, applications: StatusCandidate[], date: Date) {
  const eligible = applications.filter(app => app.sentAt && new Date(app.sentAt).getTime() <= date.getTime());
  if (!result.company) return [];
  const company = normalizeIdentity(result.company), role = normalizeIdentity(result.role);
  return eligible.filter(app => normalizeIdentity(app.company) === company &&
    (!role || normalizeIdentity(app.role) === role));
}
export function localDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
export function reportingWindow(now: Date, timeZone: string) {
  const end = localDay(now, timeZone);
  const shifted = new Date(end + "T12:00:00Z");
  shifted.setUTCDate(shifted.getUTCDate() - 7);
  const start = shifted.toISOString().slice(0, 10);
  shifted.setUTCDate(shifted.getUTCDate() - 1);
  const after = shifted.toISOString().slice(0, 10).replaceAll("-", "/");
  const next = new Date(end + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 2);
  return { start, end, query: "after:" + after + " before:" + next.toISOString().slice(0, 10).replaceAll("-", "/") };
}
