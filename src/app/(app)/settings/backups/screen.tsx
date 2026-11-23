"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

type Backup = { name: string; modified: string };
async function request(body?: unknown) {
  const response = await fetch("/api/workflow-backups", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Backup request failed.");
  return data;
}
export function BackupsScreen() {
  const [files, setFiles] = useState<Backup[]>([]);
  const [every, setEvery] = useState(10), [retain, setRetain] = useState(10);
  const [archive, setArchive] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ checksum: string; summary: { applications: number; roles: number }; createdAt: string } | null>(null);
  const [message, setMessage] = useState(""), [busy, start] = useTransition();
  async function refresh() {
    const data = await request();
    setFiles(data.files); setEvery(data.settings.every); setRetain(data.settings.retain);
  }
  useEffect(() => {
    let active = true;
    void request().then(data => {
      if (active) { setFiles(data.files); setEvery(data.settings.every); setRetain(data.settings.retain); }
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  function perform(task: () => Promise<void>) {
    start(async () => { try { await task(); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed."); } });
  }
  const button = "rounded-control border border-line px-4 py-2 disabled:opacity-50";
  return <main className="space-y-6 p-6 sm:p-10">
    <Link href="/settings?section=data" className="underline">Settings</Link>
    <h1 className="font-serif text-4xl">Backup and restore</h1>
    <p>Archives include your profile, knowledge base, documents, tracker and history. Reconnect model and Google accounts after restoring. Restored discovery and tailoring queues start paused.</p>
    <p role="status">{message}</p>
    <div className="flex flex-wrap gap-4">
      <button className={button} disabled={busy} onClick={() => perform(async () => { await request({ action: "manual" }); setMessage("Manual backup saved."); })}>Back up now</button>
      <a className={button} href="/api/workflow-backups?export=1">Download full archive</a>
    </div>
    <form className="flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); perform(async () => {
      await request({ action: "settings", every, retain }); setMessage("Backup settings saved.");
    }); }}>
      <label>Back up after preparations (0 turns off)<input className="block rounded border p-2" type="number" min={0} max={1000} required value={every} onChange={event => setEvery(Number(event.target.value))} /></label>
      <label>Automatic backups to keep<input className="block rounded border p-2" type="number" min={1} max={100} required value={retain} onChange={event => setRetain(Number(event.target.value))} /></label>
      <button className={button} disabled={busy}>Save backup settings</button>
    </form>
    <p>Each application counts once when it first becomes ready. Manual backups remain until you delete them.</p>
    <ul className="space-y-3">{files.map(file => <li key={file.name} className="flex flex-wrap items-center gap-3">
      <a className="underline" href={"/api/workflow-backups?name=" + encodeURIComponent(file.name)}>{file.name}</a>
      <button className={button} disabled={busy} onClick={() => { if (window.confirm("Delete this backup file?")) perform(async () => { await request({ action: "delete", name: file.name }); setMessage("Backup deleted."); }); }}>Delete</button>
    </li>)}</ul>
    <section className="space-y-3">
      <h2 className="text-2xl">Restore an archive</h2>
      <label>Archive file (up to 128 MiB)<input type="file" accept=".json" disabled={busy} className="block" onChange={event => {
        const file = event.target.files?.[0]; setPreview(null); setArchive(null);
        if (!file) return;
        perform(async () => {
          if (file.size > 128 * 1024 * 1024) throw new Error("Archive exceeds 128 MiB.");
          const data = JSON.parse(await file.text()); const checked = await request({ action: "preview", archive: data });
          setArchive(data); setPreview(checked); setMessage("Checksum verified.");
        });
      }} /></label>
      {preview && <div className="space-y-3">
        <p>This archive contains {preview.summary.applications} applications and {preview.summary.roles} work history entries. Restoring replaces the current data and first creates a recovery backup.</p>
        <button className={button} disabled={busy} onClick={() => perform(async () => {
          await request({ action: "restore", archive, checksum: preview.checksum }); setPreview(null); setArchive(null); setMessage("Restore complete. Reconnect integrations before resuming work.");
        })}>Confirm restore</button>
      </div>}
      <p>For a legacy Dossier export, use Import in <Link className="underline" href="/settings?section=data">Your data</Link>.</p>
    </section>
  </main>;
}
