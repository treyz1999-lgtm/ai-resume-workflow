import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ConnectionView, RunView } from "@/lib/execution/contracts";

import { ConnectionsSection } from "./connections-section";

let connection: ConnectionView;
let runs: RunView[];
const fetchMock = vi.fn<typeof fetch>();
const task: RunView = { id: "run-1", status: "RUNNING", model: "fixture-model", stage: "Reading fictional project", output: "partial", result: null, error: null, createdAt: "2026-10-29", updatedAt: "2026-10-29" };
beforeEach(() => {
  connection = { connected: false, authType: null, plan: null, models: [], limits: [] };
  runs = [];
  fetchMock.mockReset().mockImplementation(async (url, init) => {
    const path = String(url).replace("/api/execution/", "");
    if (path === "connection") return Response.json(connection);
    if (path === "runs" && init?.method === "GET") return Response.json(runs);
    if (path === "login") return Response.json({ loginId: "login-1", userCode: "ABCD-1234", verificationUrl: "https://auth.openai.com/codex/device" });
    if (path === "logout") { connection = { ...connection, connected: false }; return Response.json({}); }
    if (path === "login/cancel") return Response.json({});
    if (path === "runs") { runs = [task]; return Response.json(task); }
    if (path.endsWith("/cancel")) { runs = [{ ...task, status: "CANCELLED" }]; return Response.json(runs[0]); }
    if (path.endsWith("/resume")) { runs = [task]; return Response.json(task); }
    if (path === "latex/sample") return Response.json({ id: "sample-1", pages: 1, text: "Aurora fictional sample", pdfUrl: "/api/execution/artifacts/sample-1/sample.pdf", sourceUrl: "/api/execution/artifacts/sample-1/sample.tex" });
    return Response.json({ error: "Unexpected request" }, { status: 400 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("shows device sign-in and cancels a pending attempt", async () => {
  render(<ConnectionsSection />);
  await screen.findByText("Not connected");
  await userEvent.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
  expect(await screen.findByLabelText("Sign-in code")).toHaveTextContent("ABCD-1234");
  expect(screen.getByRole("link", { name: "Open ChatGPT sign-in" })).toHaveAttribute("href", "https://auth.openai.com/codex/device");
  await userEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
  await waitFor(() => expect(screen.queryByLabelText("Sign-in code")).not.toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledWith("/api/execution/login/cancel", expect.objectContaining({ body: '{"loginId":"login-1"}' }));
});
it("selects a model, displays usage, streams saved output and cancels/resumes a test", async () => {
  connection = { connected: true, authType: "chatgpt", plan: "plus", models: [{ id: "fixture-model", name: "Fixture model", isDefault: true }], limits: [{ name: "Codex", usedPercent: 25, windowMinutes: 300, resetsAt: 1_800_000_000 }] };
  render(<ConnectionsSection />);
  await screen.findByText("Connected · plus");
  expect(screen.getByRole("combobox", { name: "Codex model" })).toHaveValue("fixture-model");
  expect(screen.getByRole("progressbar", { name: "Codex usage" })).toHaveAttribute("value", "25");
  await userEvent.click(screen.getByRole("button", { name: "Run connection test" }));
  const run = await screen.findByRole("article", { name: "Connection test run-1" });
  expect(within(run).getByLabelText("Test output")).toHaveTextContent("partial");
  await userEvent.click(within(run).getByRole("button", { name: "Cancel test" }));
  await screen.findByText("CANCELLED · fixture-model");
  await userEvent.click(screen.getByRole("button", { name: "Resume test" }));
  await screen.findByText("RUNNING · fixture-model");
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText("Not connected");
});
it("keeps blocked jobs visible with their reason and allows explicit resume after connection", async () => {
  connection = { ...connection, connected: true };
  runs = [{ ...task, status: "BLOCKED", error: "Plan allowance reached." }];
  render(<ConnectionsSection />);
  expect(await screen.findByText("Plan allowance reached.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume test" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Run connection test" })).toBeDisabled();
});
it("compiles a sample and provides actual PDF preview and source downloads without signing in", async () => {
  render(<ConnectionsSection />);
  await userEvent.click(screen.getByRole("button", { name: "Compile sample PDF" }));
  expect(await screen.findByText("Verified 1 page; readable PDF text found.")).toBeInTheDocument();
  expect(screen.getByTitle("Compiled sample PDF")).toHaveAttribute("src", "/api/execution/artifacts/sample-1/sample.pdf");
  expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("download", "sample.pdf");
  expect(screen.getByRole("link", { name: "Download LaTeX source" })).toHaveAttribute("href", "/api/execution/artifacts/sample-1/sample.tex");
});
it("shows worker failures honestly and allows refreshing", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Worker unavailable." }, { status: 503 }));
  render(<ConnectionsSection />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Worker unavailable.");
  await userEvent.click(screen.getByRole("button", { name: "Refresh connection" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Sign-in declined." }, { status: 400 }));
  await userEvent.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in declined.");
});
