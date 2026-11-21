import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestClient, resetDatabase } from "@/test/db";
import { googleFetch } from "./account";
import { classifyStatus } from "./status-report-analysis";
import { checkStatusUpdates, resolveStatusFinding } from "./status-report";
import type { StatusClassification } from "./status-report-task";
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("@/test/db")).createTestClient() }));
vi.mock("./account", () => ({ googleFetch: vi.fn(), googleConnection: async () => ({ status: "connected", canRead: true }) }));
vi.mock("@/lib/settings-data", () => ({ loadSettings: async () => ({ gmailRead: true }) }));
vi.mock("./status-report-analysis", () => ({ classifyStatus: vi.fn() }));
vi.mock("@/lib/time-zone", () => ({ lastKnownTimeZone: async () => "America/Phoenix" }));
vi.mock("./endpoints", () => ({ googleUrl: (_host: string, path: string) => "https://google.fixture" + path }));
const db = createTestClient();
const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);
const earlier = new Date(now.getTime() - 4 * 86_400_000);
const text = "Example Labs Engineer. We invite you to interview.";
const outcome: StatusClassification = { kind: "INTERVIEW", company: "Example Labs", role: "Engineer",
  quote: "We invite you to interview.", companyQuote: "Example Labs", roleQuote: "Engineer", summary: "Interview invitation", confident: true };
function message(id: string, date = yesterday, body = text, labels: string[] = []) {
  return { id, threadId: "thread", internalDate: String(date.getTime()), labelIds: labels, payload: {
    mimeType: "text/plain", headers: [{ name: "Subject", value: "Application update" }], body: { data: Buffer.from(body).toString("base64url") },
  } };
}
beforeEach(async () => {
  vi.resetAllMocks();
  await resetDatabase(db);
  vi.mocked(googleFetch).mockImplementation(async (_group, url) => String(url).includes("/threads/")
    ? { messages: [message("mail")] } : { messages: [{ threadId: "thread" }] });
  vi.mocked(classifyStatus).mockResolvedValue(outcome);
});
afterAll(() => db.$disconnect());
async function application(id: string) {
  return db.application.create({ data: { id, company: "Example Labs", role: "Engineer", status: "SENT", sentAt: earlier, furthestStage: "SENT" } });
}
it("applies one traceable chronological update and deduplicates repeated checks", async () => {
  await application("one");
  expect(await checkStatusUpdates()).toMatchObject({ reviewed: 1, included: 1, updated: 1, review: 0 });
  expect((await db.application.findUniqueOrThrow({ where: { id: "one" } })).status).toBe("INTERVIEW");
  expect(await db.statusEvent.count()).toBe(1);
  expect(await checkStatusUpdates()).toMatchObject({ included: 0 });
  expect(await db.statusEvent.count()).toBe(1);
});
it("rechecks reapplications created while the model is reading the message", async () => {
  await application("one");
  vi.mocked(classifyStatus).mockImplementationOnce(async () => {
    await application("reapplication");
    return outcome;
  });
  expect(await checkStatusUpdates()).toMatchObject({ updated: 0, review: 1 });
  expect((await db.emailStatusFinding.findFirstOrThrow()).candidates).toHaveLength(2);
});
it("requires review for reapplications and rejects selection of an unsent attempt", async () => {
  await application("one"); await application("two");
  await db.application.create({ data: { id: "draft" } });
  expect(await checkStatusUpdates()).toMatchObject({ review: 1, updated: 0 });
  const finding = await db.emailStatusFinding.findFirstOrThrow();
  await expect(resolveStatusFinding(finding.id, "draft")).rejects.toThrow("submitted");
  await resolveStatusFinding(finding.id, "two");
  expect((await db.application.findUniqueOrThrow({ where: { id: "two" } })).status).toBe("INTERVIEW");
  expect((await db.application.findUniqueOrThrow({ where: { id: "one" } })).status).toBe("SENT");
  await resolveStatusFinding(finding.id, "one");
  expect(await db.statusEvent.count()).toBe(1);
});
it("preserves a later manual status and ignores sent messages and routine receipts", async () => {
  await application("one");
  await db.statusEvent.create({ data: { applicationId: "one", from: "SENT", to: "OFFER", at: now } });
  await db.application.update({ where: { id: "one" }, data: { status: "OFFER" } });
  expect(await checkStatusUpdates()).toMatchObject({ updated: 0 });
  expect((await db.emailStatusFinding.findFirstOrThrow()).result).toBe("STALE");
  expect((await db.application.findUniqueOrThrow({ where: { id: "one" } })).status).toBe("OFFER");
});
it("reports partial failures and reads complete MIME bodies before classification", async () => {
  await application("one");
  vi.mocked(googleFetch).mockImplementation(async (_group, url) => {
    if (String(url).includes("/attachments/")) return { data: Buffer.from(text).toString("base64url") };
    if (String(url).includes("/threads/")) return { messages: [
      { ...message("attached"), payload: { mimeType: "text/plain", body: { attachmentId: "body" } } },
      message("sent", yesterday, text, ["SENT"]),
      message("later", now),
    ] };
    return { messages: [{ threadId: "thread" }] };
  });
  vi.mocked(classifyStatus).mockResolvedValueOnce(outcome).mockRejectedValueOnce(new Error("offline"));
  const report = await checkStatusUpdates();
  expect(report).toMatchObject({ updated: 1, included: 1 });
  expect(report.warnings).toHaveLength(1);
  expect(vi.mocked(classifyStatus).mock.calls[0][0].messages[0].text).toBe(text);
});

it.each([
  ["REJECTION", "REJECTED"],
  ["ASSESSMENT", "INTERVIEW"],
  ["OFFER", "OFFER"],
  ["WITHDRAWAL", "DECLINED"],
  ["PROGRESS", "SENT"],
] as const)("records %s with message traceability and the appropriate tracker status", async (kind, status) => {
  await application("one");
  vi.mocked(classifyStatus).mockResolvedValue({ ...outcome, kind });
  await checkStatusUpdates();
  expect((await db.application.findUniqueOrThrow({ where: { id: "one" } })).status).toBe(status);
  expect(await db.emailStatusFinding.findFirstOrThrow()).toMatchObject({ messageId: "mail", applicationId: "one", kind });
});

it("excludes receipts and quoted older outcomes and preserves distinct repost notifications", async () => {
  await application("one");
  vi.mocked(classifyStatus).mockResolvedValueOnce({ ...outcome, kind: "IGNORE" });
  expect(await checkStatusUpdates()).toMatchObject({ included: 0, updated: 0 });
  vi.mocked(googleFetch).mockImplementation(async (_group, url) => String(url).includes("/threads/")
    ? { messages: [message("quoted", yesterday, "Thanks.\nOn Tuesday wrote:\n" + text)] }
    : { messages: [{ threadId: "thread" }] });
  const rejected = await checkStatusUpdates();
  expect(rejected.warnings).toHaveLength(1);
  expect(await db.emailStatusFinding.count()).toBe(0);
  vi.mocked(googleFetch).mockImplementation(async (_group, url) => String(url).includes("/threads/")
    ? { messages: [message("original")] } : { messages: [{ threadId: "thread" }] });
  await checkStatusUpdates();
  vi.mocked(googleFetch).mockImplementation(async (_group, url) => String(url).includes("/threads/")
    ? { messages: [{ ...message("reposted", now), threadId: "new-thread" }] }
    : { messages: [{ threadId: "new-thread" }] });
  await checkStatusUpdates();
  expect(await db.emailStatusFinding.count()).toBe(2);
});
