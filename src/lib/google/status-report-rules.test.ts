import { expect, it } from "vitest";
import { matchingAttempts, reportingWindow, validateStatusEvidence } from "./status-report-rules";
import type { StatusClassification } from "./status-report-task";
import { classifyStatusPrompt } from "./status-report-task";

const result: StatusClassification = { kind: "REJECTION", company: "Example Labs", role: "Engineer",
  quote: "We regret we cannot proceed.", companyQuote: "Example Labs", roleQuote: "Engineer", summary: "Rejected", confident: true };
const context = { targetId: "new", messages: [{ id: "new", from: "recruiter@example.com", subject: "Example Labs Engineer",
  date: "2026-11-21", text: "We regret we cannot proceed." }] };
it("requires current authored outcome evidence and literal identities", () => {
  expect(() => validateStatusEvidence(result, context)).not.toThrow();
  expect(() => validateStatusEvidence(result, { ...context, messages: [{ ...context.messages[0], text: "Thanks.\nOn Tuesday wrote:\nWe regret we cannot proceed." }] })).toThrow("current message");
  expect(() => validateStatusEvidence({ ...result, role: "Director" }, context)).toThrow("company or role");
  expect(() => validateStatusEvidence({ ...result, kind: "IGNORE" }, context)).not.toThrow();
});
it("keeps same-role reapplications ambiguous and excludes later submissions", () => {
  const candidate = { id: "old", company: "Example Labs, Inc.", role: "Engineer", sentAt: "2026-11-01" };
  const matches = matchingAttempts(result, [candidate, { ...candidate, id: "reapply", sentAt: "2026-11-10" }, { ...candidate, id: "future", sentAt: "2026-12-01" }], new Date("2026-11-21"));
  expect(matches.map(row => row.id)).toEqual(["old", "reapply"]);
  expect(matchingAttempts({ ...result, company: "" }, [candidate], new Date())).toEqual([]);
});
it("uses the user's calendar window and refuses to omit oversized thread context", () => {
  expect(reportingWindow(new Date("2026-11-21T03:00:00Z"), "America/Phoenix")).toMatchObject({ start: "2026-11-13", end: "2026-11-20" });
  expect(classifyStatusPrompt(context)).toContain("We regret");
  expect(() => classifyStatusPrompt({ ...context, messages: [{ ...context.messages[0], text: "a".repeat(8 * 1024 * 1024) }] })).toThrow("No context");
});
