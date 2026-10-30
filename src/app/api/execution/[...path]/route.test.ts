import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getSession } from "@/lib/auth/session";

import { GET, POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "fixture-worker-secret" } }));
const fetchMock = vi.fn<typeof fetch>();
const disconnected = { connected: false, authType: null, plan: null, models: [], limits: [] };
const task = { id: "run-1", status: "QUEUED", model: null, stage: null, output: "", result: null, error: null, createdAt: "2026-10-29", updatedAt: "2026-10-29" };
function invoke(path: string, method = "GET", body?: string, headers: Record<string, string> = {}) {
  return (method === "GET" ? GET : POST)(new NextRequest(`http://localhost:3000/api/execution/${path}`, {
    method, ...(body !== undefined ? { body } : {}), headers: { host: "localhost:3000", origin: "http://localhost:3000", ...headers },
  }), { params: Promise.resolve({ path: path.split("/") }) });
}
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() });
  fetchMock.mockReset().mockResolvedValue(Response.json(disconnected));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requires an app session and rejects cross-origin mutations before contacting the worker", async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await invoke("connection")).status).toBe(401);
  expect((await invoke("login", "POST", "{}", { origin: "https://evil.example" })).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("only forwards allowlisted operations and rejects traversal and arbitrary inputs", async () => {
  expect((await invoke("rpc", "POST", "{}")).status).toBe(404);
  expect((await invoke("runs/../logout", "POST", "{}")).status).toBe(404);
  expect((await invoke("runs", "POST", '{"prompt":"read my files"}')).status).toBe(400);
  expect((await invoke("runs", "POST", "not-json")).status).toBe(400);
  expect((await invoke("login", "POST", "x".repeat(4100))).status).toBe(413);
  expect((await invoke("login", "POST", "{}", { "content-length": "5000" })).status).toBe(413);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("sends the internal token only to the worker and strips unknown response properties", async () => {
  vi.stubEnv("WORKER_URL", "http://worker:4310/");
  fetchMock.mockResolvedValueOnce(Response.json({ ...disconnected, token: "must-not-leave-worker" }));
  const response = await invoke("connection");
  expect(await response.json()).toEqual(disconnected);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(fetchMock).toHaveBeenCalledWith("http://worker:4310/connection", expect.objectContaining({ headers: { "X-Worker-Token": "fixture-worker-secret" }, redirect: "error" }));
});
it("passes only model selection for diagnostics and supports run lifecycle routes", async () => {
  for (const [path, method, body] of [["runs", "POST", '{"model":"model-fixture"}'], ["runs/run-1", "GET"], ["runs/run-1/cancel", "POST", "{}"], ["runs/run-1/resume", "POST", "{}"]]) {
    fetchMock.mockResolvedValueOnce(Response.json(task));
    expect(await (await invoke(path, method, body)).json()).toEqual(task);
  }
  fetchMock.mockResolvedValueOnce(Response.json([task]));
  expect(await (await invoke("runs")).json()).toEqual([task]);
});
it("accepts device login only with an official HTTPS verification URL", async () => {
  const value = { loginId: "login-1", userCode: "ABCD-1234", verificationUrl: "https://auth.openai.com/codex/device" };
  fetchMock.mockResolvedValueOnce(Response.json(value));
  expect(await (await invoke("login", "POST", "{}")).json()).toEqual(value);
  fetchMock.mockResolvedValueOnce(Response.json({ ...value, verificationUrl: "https://evil.example/sign-in" }));
  expect((await invoke("login", "POST", "{}")).status).toBe(503);
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  expect((await invoke("login/cancel", "POST", '{"loginId":"login-1"}')).status).toBe(200);
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  expect((await invoke("logout", "POST", "{}")).status).toBe(200);
});
it("rebuilds artifact links and serves fixed file types without forwarding worker headers", async () => {
  const id = "c0a80101-0000-4000-8000-000000000001";
  fetchMock.mockResolvedValueOnce(Response.json({ id, pages: 1, text: "Aurora", pdfUrl: "http://private/path", sourceUrl: "http://private/source" }));
  const artifact = await (await invoke("latex/sample", "POST", "{}")).json();
  expect(artifact.pdfUrl).toBe(`/api/execution/artifacts/${id}/sample.pdf`);
  expect(artifact.sourceUrl).toBe(`/api/execution/artifacts/${id}/sample.tex`);
  fetchMock.mockResolvedValueOnce(new Response("%PDF-fixture", { headers: { "set-cookie": "secret=value", "x-worker-token": "secret" } }));
  const pdf = await invoke(`artifacts/${id}/sample.pdf`);
  expect(await pdf.text()).toBe("%PDF-fixture");
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
  expect(pdf.headers.get("set-cookie")).toBeNull();
  fetchMock.mockResolvedValueOnce(new Response("latex"));
  expect((await invoke(`artifacts/${id}/sample.tex`)).headers.get("content-disposition")).toContain("attachment");
  expect((await invoke(`artifacts/${id}/auth.json`)).status).toBe(404);
});
it("returns safe errors when worker requests fail or malformed data arrives", async () => {
  for (const status of [400, 401, 404, 409, 429, 503, 500]) {
    fetchMock.mockResolvedValueOnce(new Response("secret internal error", { status }));
    const response = await invoke("connection");
    expect(response.ok).toBe(false);
    expect(await response.text()).not.toContain("secret");
  }
  fetchMock.mockRejectedValueOnce(new Error("credential=hidden"));
  expect((await invoke("connection")).status).toBe(503);
  fetchMock.mockResolvedValueOnce(Response.json({ incomplete: true }));
  expect((await invoke("connection")).status).toBe(503);
});
