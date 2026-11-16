import { describe, expect, it } from "vitest";
import { columns, encodeTracker, parseTracker } from "./format";

describe("tracker CSV", () => {
  it("round-trips multiline, Unicode, quotes, formulas as literals, and all legacy columns", () => {
    const row = Object.fromEntries(columns.map(col => [col,""]));
    Object.assign(row,{company:'@Example, "Labs"',job_title:"Data\nAnalyst",date_applied:"2/29/2024",application_status:"Applied",experience_requirement:"3–5 years"});
    const csv = encodeTracker([row]);
    expect(csv).toContain("'@Example");
    const [attempt] = parseTracker("\ufeff"+csv);
    expect(attempt.fields).toEqual(row);
    expect(attempt.status).toBe("SENT");
    expect(attempt.applied?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
  it("preserves repeated applications while assigning repeatable IDs", () => {
    const csv = "company,job_title,date_applied\r\nExample,Analyst,2026-08-17\r\nExample,Analyst,2026-08-17\r\nExample,Analyst,2026-09-17\r\n";
    const ids = parseTracker(csv).map(a => a.id);
    expect(new Set(ids).size).toBe(3);
    expect(parseTracker(csv).map(a => a.id)).toEqual(ids);
  });
  it("preserves explicit IDs, separate from company and title", () => {
    const csv = encodeTracker([{local_id:"abc",company:"Example",job_title:"Analyst",application_status:"Applied"}]);
    expect(parseTracker(csv)[0].id).toBe("abc");
  });
  it.each([
    ["company,job_title\nA,", "required"],
    ["company,company,job_title\nA,A,B", "Duplicate column"],
    ["company,job_title\nA,B,C", "expected 2 fields"],
    ["company,job_title\nA,\"B", "Unclosed"],
    ["company,job_title,date_applied\nA,B,2/29/2026", "YYYY-MM-DD"],
    ["company,job_title,application_status\nA,B,other", "unrecognized application status"],
    ["company,job_title,application_id\nA,B,3\nA,C,3", "duplicate attempt ID"],
  ])("rejects invalid input", (csv,problem) => expect(() => parseTracker(csv)).toThrow(problem));
});
