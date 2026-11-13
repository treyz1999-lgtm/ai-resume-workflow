import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth/session";
import { GET } from "./route";

const db = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { tailoringRevision: db } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
function read(file: string) {
  return GET(new NextRequest("http://localhost/api/tailoring/revisions/test?file=" + file), { params: Promise.resolve({ id: "test" }) });
}
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() });
  db.findFirst.mockReset();
});
it("requires a session before reading revision bytes", async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await read("pdf")).status).toBe(401);
  expect(db.findFirst).not.toHaveBeenCalled();
});
it.each(["pdf", "preview", "source", "verification", "report"])("requires current readiness before delivering %s", async file => {
  db.findFirst.mockResolvedValue(null);
  expect((await read(file)).status).toBe(404);
  expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "test", run: { status: "PENDING" } } }));
});
it("delivers exact original PDF bytes with a private download header", async () => {
  const bytes = Uint8Array.from([37, 80, 68, 70, 0, 255]);
  db.findFirst.mockResolvedValue({ kind: "letter", pdf: bytes });
  const response = await read("pdf");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("content-disposition")).toContain("cover-letter.pdf");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("delivers frozen HTML theme source as editable JSON", async () => {
  db.findFirst.mockResolvedValue({ kind: "resume", format: "html", source: '{"theme":"fixture"}' });
  const response = await read("source");
  expect(response.headers.get("content-disposition")).toContain("resume.json");
  expect(await response.json()).toEqual({ theme: "fixture" });
});
