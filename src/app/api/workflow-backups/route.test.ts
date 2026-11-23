import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth/session";
import { writeBackup, listBackups } from "@/lib/backups";
import { restoreWorkflowArchive, validateWorkflowArchive } from "@/lib/workflow-archive";
import { GET, POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => "{}"), unlink: vi.fn() }));
vi.mock("@/lib/backups", () => ({ backupsDir: () => "/tmp/fictional", listBackups: vi.fn(async () => [{ name: "manual.json" }]), writeBackup: vi.fn(async () => "manual.json") }));
vi.mock("@/lib/workflow-archive", () => ({ archiveSummary: vi.fn(() => ({ applications: 2, roles: 1 })), exportWorkflowArchive: vi.fn(async () => ({})), restoreWorkflowArchive: vi.fn(async () => ({ applications: 2 })), validateWorkflowArchive: vi.fn(value => value) }));
vi.mock("@/lib/preparation-backups", () => ({ loadPreparationBackupSettings: vi.fn(async () => ({ every: 10, retain: 10 })), savePreparationBackupSettings: vi.fn() }));
const archive = { sha256: "checksum", createdAt: "2026-11-22" };
const read = (query = "") => GET(new NextRequest("http://localhost/api/workflow-backups" + query), {});
const post = (body: unknown, headers = {}) => POST(new NextRequest("http://localhost/api/workflow-backups", { method: "POST", headers: { origin: "http://localhost", host: "localhost", ...headers }, body: JSON.stringify(body) }), {});
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue({ persistent: false, issuedAt: new Date(), expiresAt: new Date() }); });
it("requires authentication and refuses cross-origin archive mutations", async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await read()).status).toBe(401);
  expect(listBackups).not.toHaveBeenCalled();
  expect((await post({ action: "manual" }, { origin: "https://other.example" })).status).toBe(403);
  expect(writeBackup).not.toHaveBeenCalled();
});
it("serves only listed backup names with private download headers", async () => {
  expect((await read("?name=..%2Fsecret")).status).toBe(404);
  const response = await read("?name=manual.json");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-disposition")).toContain("manual.json");
  expect(await response.json()).toEqual({});
});
it("previews without restoring and refuses an unconfirmed checksum", async () => {
  const response = await post({ action: "preview", archive });
  expect(await response.json()).toMatchObject({ checksum: "checksum", summary: { applications: 2 } });
  expect(writeBackup).not.toHaveBeenCalled();
  expect(restoreWorkflowArchive).not.toHaveBeenCalled();
  expect((await post({ action: "restore", archive, checksum: "other" })).status).toBe(400);
  expect(restoreWorkflowArchive).not.toHaveBeenCalled();
});
it("writes a recovery backup before confirmed restore and stops if that backup fails", async () => {
  expect((await post({ action: "restore", archive, checksum: "checksum" })).status).toBe(200);
  expect(writeBackup).toHaveBeenCalledWith("before-import");
  expect(vi.mocked(writeBackup).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(restoreWorkflowArchive).mock.invocationCallOrder[0]);
  vi.mocked(writeBackup).mockRejectedValueOnce(new Error("Disk full"));
  expect((await post({ action: "restore", archive, checksum: "checksum" })).status).toBe(400);
  expect(restoreWorkflowArchive).toHaveBeenCalledTimes(1);
});
it("rejects invalid archives and oversized requests before any mutation", async () => {
  vi.mocked(validateWorkflowArchive).mockImplementationOnce(() => { throw new Error("Checksum mismatch"); });
  expect(await (await post({ action: "preview", archive })).json()).toEqual({ error: "Checksum mismatch" });
  expect((await post({ action: "manual" }, { "content-length": String(129 * 1024 * 1024) })).status).toBe(413);
  expect(writeBackup).not.toHaveBeenCalled();
});
