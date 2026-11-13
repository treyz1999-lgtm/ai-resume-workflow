import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { QueueView } from "@/lib/tailoring/contracts";
import { TailoringScreen } from "./tailoring-screen";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), move: vi.fn(), cancel: vi.fn(), retry: vi.fn(), remove: vi.fn(), setPaused: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => "/tailoring" }));
vi.mock("./actions", () => mocks);
const row = (id: string, status: QueueView["rows"][number]["status"], position = 0): QueueView["rows"][number] =>
  ({ id, role: id, company: "Fixture", status, position, stage: "Reviewing", error: null, score: null, documents: [] });
beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset().mockResolvedValue({ ok: true, data: null }); });

it("orders waiting items and offers removal and one-position moves", async () => {
  render(<TailoringScreen view={{ paused: true, rows: [row("Alpha", "QUEUED", 2), row("Beta", "QUEUED", 1)] }} />);
  expect(screen.getByRole("button", { name: "Move Beta · Fixture up" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Move Alpha · Fixture up" }));
  expect(mocks.move).toHaveBeenCalledWith({ id: "Alpha", direction: -1 });
  await userEvent.click(screen.getByRole("button", { name: "Remove Beta · Fixture" }));
  expect(mocks.remove).toHaveBeenCalledWith({ id: "Beta" });
  await userEvent.click(screen.getByRole("button", { name: "Resume queue" }));
  expect(mocks.setPaused).toHaveBeenCalledWith({ paused: false });
});
it("exposes cancellation, explains blocked work, and offers retry", async () => {
  render(<TailoringScreen view={{ paused: false, rows: [row("Alpha", "RUNNING"), { ...row("Beta", "FAILED"), error: "Five projects required." }] }} />);
  expect(screen.getByText("Five projects required.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cancel preparation" }));
  expect(mocks.cancel).toHaveBeenCalledWith({ id: "Alpha" });
  mocks.retry.mockResolvedValueOnce({ ok: false, error: "Refresh and try again." });
  await userEvent.click(screen.getByRole("button", { name: "Retry preparation" }));
  expect(mocks.retry).toHaveBeenCalledWith({ id: "Beta" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh and try again.");
});
it("only offers document delivery for pending preparations", () => {
  const documents = [{ id: "ready", kind: "resume", format: "latex" }];
  render(<TailoringScreen view={{ paused: false, rows: [{ ...row("Alpha", "PENDING"), documents, score: 75 }, { ...row("Beta", "FAILED"), documents }] }} />);
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/api/tailoring/revisions/ready?file=pdf");
  expect(screen.getByText(/Resume evidence alignment 75%/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Verification record" })).toHaveAttribute("href", "/api/tailoring/revisions/ready?file=verification");
});
