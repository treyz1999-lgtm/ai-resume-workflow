"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ResumeLibrary({ assets }: { assets: { id: string; name: string; size: number; createdAt: string }[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true); setError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("PDF must be at most 10 MB.");
      const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/pdf", "X-File-Name": file.name.replace(/[^\x20-\x7E]/g, "_") }, body: file });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Upload failed.");
      setSelected(result.id); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <label className="flex flex-col gap-2">Upload a PDF resume (up to 10 MB)
      <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label>
    {busy && <p role="status">Saving resume and generating a preview…</p>}{error && <p role="alert">{error}</p>}
    {!assets.length && <p>No resumes yet. Add a PDF to preserve it as a reference.</p>}
    <ul className="space-y-4">{assets.map(asset => <li key={asset.id} className="rounded-card border border-line p-4 space-y-3">
      <h2 className="font-medium break-all">{asset.name}</h2><p className="text-sm">{new Date(asset.createdAt).toLocaleDateString()} · {Math.ceil(asset.size / 1024)} KB</p>
      <div className="flex gap-4 items-center"><Button variant="secondary" onClick={() => setSelected(selected === asset.id ? null : asset.id)}>{selected === asset.id ? "Hide preview" : "Preview"}</Button>
      <a className="underline" href={`/api/library/${asset.id}`}>Download PDF</a></div>
      {selected === asset.id && <><p className="text-sm">First-page preview. Download the PDF to view all pages.</p><Image unoptimized src={`/api/library/${asset.id}?preview=1`} width={1020} height={1320} alt={`First page of ${asset.name}`} className="w-full max-w-3xl h-auto border border-line" /></>}
    </li>)}</ul>
  </div>;
}
