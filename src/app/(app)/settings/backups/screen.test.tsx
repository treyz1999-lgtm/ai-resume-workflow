import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BackupsScreen } from "./screen";

const initial = { files: [{ name: "manual.json", modified: "2026-11-22" }], settings: { every: 10, retain: 10 } };
afterEach(() => vi.unstubAllGlobals());
function mockApi(post: (body: Record<string, unknown>) => Response = () => Response.json({ ok: true })) {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.body ? post(JSON.parse(String(options.body))) : Response.json(initial));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function file(text = '{"version":1}') {
  const upload = new File([text], "workflow.json", { type: "application/json" });
  Object.defineProperty(upload, "text", { value: async () => text });
  return upload;
}
it("loads saved controls, saves settings, and creates a manual backup", async () => {
  const fetch = mockApi(), user = userEvent.setup();
  render(<BackupsScreen />);
  expect(await screen.findByRole("link", { name: "manual.json" })).toHaveAttribute("href", "/api/workflow-backups?name=manual.json");
  const every = screen.getByLabelText(/Back up after preparations/);
  await user.clear(every); await user.type(every, "25");
  await user.click(screen.getByRole("button", { name: "Save backup settings" }));
  expect(fetch).toHaveBeenCalledWith("/api/workflow-backups", expect.objectContaining({ body: JSON.stringify({ action: "settings", every: 25, retain: 10 }) }));
  await user.click(screen.getByRole("button", { name: "Back up now" }));
  expect(screen.getByRole("status")).toHaveTextContent("Manual backup saved");
});
it("requires a successful preview and an explicit restore click with its checksum", async () => {
  const fetch = mockApi(body => Response.json(body.action === "preview" ? { checksum: "verified-checksum", summary: { applications: 2, roles: 1 } } : { ok: true }));
  const user = userEvent.setup(); render(<BackupsScreen />);
  await screen.findByRole("link", { name: "manual.json" });
  expect(screen.queryByRole("button", { name: "Confirm restore" })).not.toBeInTheDocument();
  await user.upload(screen.getByLabelText(/Archive file/), file());
  expect(await screen.findByText(/contains 2 applications and 1 work history/)).toBeVisible();
  expect(fetch.mock.calls.filter(([, options]) => String(options?.body).includes('"restore"'))).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Confirm restore" }));
  expect(fetch).toHaveBeenCalledWith("/api/workflow-backups", expect.objectContaining({ body: JSON.stringify({ action: "restore", archive: { version: 1 }, checksum: "verified-checksum" }) }));
  expect(screen.getByRole("status")).toHaveTextContent("Restore complete");
});
it("clears the confirmation when another archive fails checksum verification", async () => {
  let previews = 0;
  mockApi(() => ++previews === 1 ? Response.json({ checksum: "first", summary: { applications: 1, roles: 1 } }) : Response.json({ error: "Checksum mismatch" }, { status: 400 }));
  const user = userEvent.setup(); render(<BackupsScreen />);
  await screen.findByRole("link", { name: "manual.json" });
  await user.upload(screen.getByLabelText(/Archive file/), file());
  await screen.findByRole("button", { name: "Confirm restore" });
  await user.upload(screen.getByLabelText(/Archive file/), file('{"version":2}'));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Checksum mismatch"));
  expect(screen.queryByRole("button", { name: "Confirm restore" })).not.toBeInTheDocument();
});
it("asks before deletion and shows request failures", async () => {
  const fetch = mockApi(() => Response.json({ error: "Disk full" }, { status: 400 }));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup(); render(<BackupsScreen />);
  await screen.findByRole("link", { name: "manual.json" });
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByRole("status")).toHaveTextContent("Disk full");
  confirm.mockRestore();
});
