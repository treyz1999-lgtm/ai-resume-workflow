import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPdf } from "../pdf/render";
import { printSnapshotSchema, type PrintSnapshot } from "./render-input";

// The print process can reload the immutable revision even when Next routes
// the Chromium request to a different module/process of the same installation.
export async function printFrozenResume(snapshot: PrintSnapshot): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "tailoring-print-"));
  try {
    await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot), { mode: 0o600, flag: "wx" });
    return await renderPdf("/print/tailoring/" + dir.slice(-6));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function readPrintSnapshot(id: string): Promise<PrintSnapshot | null> {
  if (!/^[a-zA-Z0-9]{6}$/.test(id)) return null;
  try { return printSnapshotSchema.parse(JSON.parse(await readFile(join(tmpdir(), "tailoring-print-" + id, "snapshot.json"), "utf8"))); }
  catch { return null; }
}

