import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth/session";
import { POST } from "./route";
import { GET } from "./[id]/route";
const mocks = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { resumeAsset: mocks } }));
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "fixture-secret" } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
const fetchMock = vi.fn();
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
function upload(body = "%PDF-fixture", origin = "http://localhost") {
  return POST(new NextRequest("http://localhost/api/library", { method: "POST", headers: { host: "localhost", origin, "content-type": "application/pdf", "x-file-name": "example.pdf" }, body }), undefined);
}
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() });
  mocks.create.mockReset().mockResolvedValue({ id: "fixture" }); mocks.findUnique.mockReset();
  fetchMock.mockReset().mockResolvedValue(new Response(png)); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it("requires authentication and same-origin uploads", async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await upload()).status).toBe(401);
  expect((await upload("%PDF-fixture", "https://other.example")).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects malformed and oversized PDFs before storage", async () => {
  expect((await upload("invalid")).status).toBe(400);
  expect((await upload("%PDF-" + "x".repeat(10 * 1024 * 1024))).status).toBe(413);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("stores reference bytes only after preview verification", async () => {
  expect((await upload()).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "example.pdf", data: new Uint8Array(Buffer.from("%PDF-fixture")), preview: png }) }));
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/library/preview"), expect.objectContaining({ redirect: "error" }));
});
it("does not save unpreviewable or invalid worker output", async () => {
  fetchMock.mockResolvedValueOnce(new Response("failed", { status: 503 }));
  expect((await upload()).status).toBe(503);
  fetchMock.mockResolvedValueOnce(new Response("invalid"));
  expect((await upload()).status).toBe(503);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("serves a private download or preview and handles missing records", async () => {
  const request = (suffix = "") => new NextRequest(`http://localhost/api/library/fixture${suffix}`, { headers: { host: "localhost" } });
  const context = { params: Promise.resolve({ id: "fixture" }) };
  mocks.findUnique.mockResolvedValueOnce(null);
  expect((await GET(request(), context)).status).toBe(404);
  mocks.findUnique.mockResolvedValue({ name: 'resume".pdf', data: Buffer.from("%PDF-fixture"), preview: png });
  const pdf = await GET(request(), context);
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
  expect(pdf.headers.get("content-disposition")).toContain("attachment;");
  expect(pdf.headers.get("cache-control")).toBe("private, no-store");
  expect((await GET(request("?preview=1"), context)).headers.get("content-type")).toBe("image/png");
});
