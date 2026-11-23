import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { route } from "@/lib/route";
import { backupsDir, listBackups, writeBackup } from "@/lib/backups";
import { archiveSummary, exportWorkflowArchive, restoreWorkflowArchive, validateWorkflowArchive } from "@/lib/workflow-archive";
import { loadPreparationBackupSettings, savePreparationBackupSettings } from "@/lib/preparation-backups";

export const GET = route(async request => {
  const name = request.nextUrl.searchParams.get("name");
  if (name) {
    if (!(await listBackups()).some(file => file.name === name)) return new Response(null, { status: 404 });
    return new Response(await readFile(path.join(backupsDir(), name), "utf8"), { headers: {
      "content-type": "application/json", "content-disposition": 'attachment; filename="' + name + '"',
    } });
  }
  if (request.nextUrl.searchParams.has("export")) return new Response(JSON.stringify(await exportWorkflowArchive()), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="ai-resume-workflow.json"' },
  });
  return NextResponse.json({ files: await listBackups(), settings: await loadPreparationBackupSettings() });
});
export const POST = route(async request => {
  if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024 * 1024) return NextResponse.json({ error: "Archive exceeds the 128 MiB upload limit." }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("No backup request body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 128 * 1024 * 1024) {
          await reader.cancel();
          return NextResponse.json({ error: "Archive exceeds the 128 MiB upload limit." }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (data.action === "manual") return NextResponse.json({ name: await writeBackup("manual") });
    if (data.action === "settings") {
      await savePreparationBackupSettings(data.every, data.retain);
      return NextResponse.json({ ok: true });
    }
    if (data.action === "delete") {
      if (!(await listBackups()).some(file => file.name === data.name)) throw new Error("Backup not found.");
      await unlink(path.join(backupsDir(), data.name));
      return NextResponse.json({ ok: true });
    }
    const archive = validateWorkflowArchive(data.archive);
    if (data.action === "preview") return NextResponse.json({ summary: archiveSummary(archive), checksum: archive.sha256, createdAt: archive.createdAt });
    if (data.action !== "restore" || data.checksum !== archive.sha256) throw new Error("Preview this archive before confirming restore.");
    await writeBackup("before-import");
    const summary = await restoreWorkflowArchive(archive);
    revalidatePath("/", "layout");
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backup operation failed." }, { status: 400 });
  }
});
