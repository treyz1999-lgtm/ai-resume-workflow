import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DocumentReview } from "@/lib/tailoring/document-review";
import { ReviewScreen } from "./review-screen";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), revise: vi.fn(), submitDocuments: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => "/tailoring/example" }));
vi.mock("./actions", () => mocks);
const evidence = [{ text: "Built reports.", quote: "Built reports.", sourceId: "project" }];
const report = { verified: true, score: 75, problems: [], report: { keywordCoverage: 80, requirements: [
  { jdQuote: "Reporting", importance: "core", alignment: "direct", explanation: "Supported.", pdfQuote: "Built reports.", kbQuote: "Built reports." },
] } };
function fixture(): DocumentReview {
  return {
    id: "example", generation: 2, status: "PENDING", stage: "Pending submission", error: null,
    role: "Engineer", company: "Fictional Labs", applicationId: undefined, composition: "Selected two projects.",
    projectNames: { project: "Aurora" }, plan: { selected: ["project", "fallback"], reviewed: [{ id: "project", reason: "Evidence fits" }], rationale: "Relevant evidence" },
    claims: evidence, history: [{ generation: 1, canRestore: true, reason: "Shorten wording" }],
    revisions: [
      { id: "resume2", generation: 2, kind: "resume", format: "latex", verification: { pages: 1 }, matchReport: report, evidence },
      { id: "letter2", generation: 2, kind: "letter", format: "latex", verification: { pages: 1 }, matchReport: report, evidence: [] },
      { id: "resume1", generation: 1, kind: "resume", format: "latex", verification: { pages: 1 }, matchReport: report, evidence },
    ],
  };
}
beforeEach(() => { Object.values(mocks).forEach(fn => fn.mockReset().mockResolvedValue({ ok: true, data: null })); });

it("submits the selected historical PDF with the entered date and optional letter choice", async () => {
  render(<ReviewScreen data={fixture()} />);
  expect(screen.getByRole("button", { name: "Mark submitted" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Submission date"), { target: { value: "2026-11-01" } });
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
  expect(mocks.submitDocuments).toHaveBeenLastCalledWith({ id: "example", resume: "resume2", letter: null, date: "2026-11-01" });
  await userEvent.selectOptions(screen.getByLabelText("Document version"), "1");
  await userEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
  expect(mocks.submitDocuments).toHaveBeenLastCalledWith({ id: "example", resume: "resume1", letter: null, date: "2026-11-01" });
  expect(await screen.findByRole("status")).toHaveTextContent("Submission recorded");
});

it("sends manual edits for verification and keeps the displayed error on failed saves", async () => {
  render(<ReviewScreen data={fixture()} />);
  await userEvent.click(screen.getByText("Edit a statement"));
  await userEvent.clear(screen.getByLabelText("Wording"));
  await userEvent.type(screen.getByLabelText("Wording"), "Built reproducible reports.");
  mocks.revise.mockResolvedValueOnce({ ok: false, error: "Evidence is insufficient." });
  await userEvent.click(screen.getByRole("button", { name: "Save and verify" }));
  expect(mocks.revise).toHaveBeenCalledWith({ id: "example", generation: 2, request: { mode: "manual", index: 0, text: "Built reproducible reports." } });
  expect(await screen.findByRole("status")).toHaveTextContent("Evidence is insufficient");
  mocks.revise.mockRejectedValueOnce(new Error("Connection lost"));
  await userEvent.type(screen.getByLabelText("Refinement request"), "Shorten the reports bullet.");
  await userEvent.click(screen.getByRole("button", { name: "Request revision" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Could not save");
});

it("restores a historical version through verification and links an existing submission", async () => {
  render(<ReviewScreen data={{ ...fixture(), applicationId: "submitted" }} initialVersion={1} />);
  expect(screen.queryByRole("button", { name: "Mark submitted" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View submitted application" })).toHaveAttribute("href", "/applications/submitted");
  await userEvent.click(screen.getByRole("button", { name: "Restore version 1 and verify" }));
  expect(mocks.revise).toHaveBeenCalledWith({ id: "example", generation: 2, request: { mode: "restore", generation: 1 } });
  expect(await screen.findByRole("status")).toHaveTextContent("queued for verification");
});

it("prevents editing running work and exposes a failed verification without downloads", () => {
  const data = fixture();
  render(<ReviewScreen data={{ ...data, status: "RUNNING", revisions: [], error: "Verification needs review" }} />);
  expect(screen.queryByLabelText("Refinement request")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark submitted" })).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Verification needs review");
});

it("shows rejected evidence and permits another refinement", () => {
  const data = fixture();
  render(<ReviewScreen data={{ ...data, status: "FAILED", revisions: [{ ...data.revisions[0], matchReport: { verified: false, score: null, problems: ["Unsupported claim"], report: {} } }] }} />);
  expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
  expect(screen.getByText("Unsupported claim")).toBeInTheDocument();
  expect(screen.getByLabelText("Refinement request")).toBeVisible();
});
