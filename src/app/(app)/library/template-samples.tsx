"use client";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TemplateSamples() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [artifact, setArtifact] = useState<{ pdfUrl: string; sourceUrl: string; pages: number } | null>(null);
  async function compile(preset: string) {
    setBusy(true); setError(""); setArtifact(null);
    try {
      const response = await fetch(`/api/execution/templates/${preset}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setArtifact(result);
    } catch(e) { setError(e instanceof Error ? e.message : "Compilation failed."); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-card border border-line p-5"><h2 className="text-xl font-medium">V5 templates</h2>
    <p>Preview the registered layouts with fictional data. Your SWE/Data work-history settings will determine role inclusion during tailoring.</p>
    <div className="flex flex-wrap gap-3">{[["swe", "V5 SWE"], ["data", "V5 Data"], ["cover-letter", "Cover letter"]].map(([id,label]) => <Button key={id} disabled={busy} variant="secondary" onClick={() => void compile(id)}>{label}</Button>)}</div>
    {busy && <p role="status">Compiling locally…</p>}{error && <p role="alert">{error}</p>}
    {artifact && <><p role="status">Verified {artifact.pages} page; readable PDF text.</p><div className="flex gap-4"><a className="underline" href={artifact.pdfUrl} download>Download template PDF</a><a className="underline" href={artifact.sourceUrl}>Download editable LaTeX</a></div>
      <Image unoptimized src={artifact.pdfUrl.replace(/sample\.pdf$/, "sample.png")} width={1020} height={1320} alt="Rendered template sample" className="h-auto w-full max-w-3xl" /></>}
  </section>;
}
