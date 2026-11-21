import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { UpdatesScreen, type StatusFindingView } from "./updates-screen";
import { checkUpdates, resolveFinding } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/inbox/updates" }));
vi.mock("./actions", () => ({ checkUpdates: vi.fn(), resolveFinding: vi.fn() }));
const choices = [
  { id: "first", company: "Example Labs", role: "Engineer", sentAt: "2026-11-01T00:00:00.000Z" },
  { id: "repost", company: "Example Labs", role: "Engineer", sentAt: "2026-11-15T00:00:00.000Z" },
];
const finding: StatusFindingView = {
  id: "finding", messageId: "message", threadId: "thread", emailDate: "2026-11-20T17:00:00.000Z",
  company: "Example Labs", role: "Engineer", summary: "An interview was offered.", kind: "INTERVIEW",
  result: "REVIEW", applicationId: null, candidates: choices,
};
const props = { findings: [finding], applications: choices, connected: true, timeZone: "America/Phoenix" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkUpdates).mockResolvedValue({ ok: true, data: { reviewed: 5, included: 2, updated: 1, review: 1, warnings: ["A thread could not be read. Retry the check."] } });
  vi.mocked(resolveFinding).mockResolvedValue({ ok: true, data: null });
});

it("checks explicitly and reports saved counts", async () => {
  const user = userEvent.setup();
  render(<UpdatesScreen {...props} />);
  expect(checkUpdates).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Check updates" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Reviewed 5 messages · 2 findings · 1 applications updated · 1 need review.");
  expect(checkUpdates).toHaveBeenCalledWith({});
});

it("requires an explicit attempt choice and preserves the date of a repost", async () => {
  const user = userEvent.setup();
  render(<UpdatesScreen {...props} />);
  expect(screen.getByRole("button", { name: "Apply update" })).toBeDisabled();
  expect(screen.getByRole("option", { name: /2026-11-15/ })).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox"), "repost");
  await user.click(screen.getByRole("button", { name: "Apply update" }));
  await waitFor(() => expect(resolveFinding).toHaveBeenCalledWith({ id: "finding", applicationId: "repost" }));
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(resolveFinding).toHaveBeenLastCalledWith({ id: "finding", applicationId: null }));
});

it("shows failed checks and leaves the review finding available", async () => {
  vi.mocked(checkUpdates).mockResolvedValue({ ok: false, error: "Reconnect Gmail to continue." });
  const user = userEvent.setup();
  render(<UpdatesScreen {...props} />);
  await user.click(screen.getByRole("button", { name: "Check updates" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Reconnect Gmail");
  expect(screen.getByText("Needs review")).toBeVisible();
});

it("offers Google setup when disconnected and links a recorded application", () => {
  render(<UpdatesScreen {...props} connected={false} findings={[{ ...finding, result: "APPLIED", applicationId: "first" }]} />);
  expect(screen.queryByRole("button", { name: "Check updates" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Connect Gmail" })).toHaveAttribute("href", "/settings?section=google");
  expect(screen.getByRole("link", { name: "View application" })).toHaveAttribute("href", "/applications/first");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("lets the user choose an existing attempt for an unmatched finding and preserves a rejected resolution", async () => {
  vi.mocked(resolveFinding).mockResolvedValue({ ok: false, error: "A newer status is already recorded." });
  const user = userEvent.setup();
  render(<UpdatesScreen {...props} findings={[{ ...finding, result: "NO_MATCH", candidates: [] }]} />);
  await user.selectOptions(screen.getByRole("combobox"), "first");
  await user.click(screen.getByRole("button", { name: "Apply update" }));
  expect(await screen.findByRole("status")).toHaveTextContent("A newer status is already recorded.");
  expect(screen.getByText("No matching application")).toBeVisible();
});

it("shows recoverable transport failures without hiding findings", async () => {
  vi.mocked(checkUpdates).mockRejectedValue(new Error("offline"));
  vi.mocked(resolveFinding).mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<UpdatesScreen {...props} />);
  await user.click(screen.getByRole("button", { name: "Check updates" }));
  expect(await screen.findByText(/Saved findings are shown below/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(await screen.findByText(/Could not confirm this update/)).toBeVisible();
  expect(screen.getByText("An interview was offered.")).toBeVisible();
});
