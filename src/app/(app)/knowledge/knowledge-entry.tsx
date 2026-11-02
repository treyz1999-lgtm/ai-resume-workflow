"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ARCHITECTURE_IMAGE_MAX_BYTES } from "@/lib/knowledge-contracts";
import { saveDetail } from "./actions";

type Detail = { context: string; architecture: string; architectureImage: string; includeSwe: boolean; includeData: boolean };
const empty: Detail = { context: "", architecture: "", architectureImage: "", includeSwe: true, includeData: true };

export function KnowledgeEntry({ kind, entryId, title, initial }: { kind: "project" | "experience"; entryId: string; title: string; initial?: Detail }) {
  const router = useRouter();
  const [value, setValue] = useState<Detail>(() => {
    const detail = initial ?? empty;
    return { context: detail.context, architecture: detail.architecture, architectureImage: detail.architectureImage,
      includeSwe: detail.includeSwe, includeData: detail.includeData };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const update = (patch: Partial<Detail>) => { setValue(current => ({ ...current, ...patch })); setSaved(false); };
  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > ARCHITECTURE_IMAGE_MAX_BYTES) { setError("Choose a PNG or JPEG image no larger than 512 KB."); return; }
    setBusy(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      update({ architectureImage: image });
    } catch { setError("The image could not be read."); }
    finally { setBusy(false); }
  };
  return <details className="rounded-card border border-line p-4">
    <summary className="cursor-pointer font-medium">{title}</summary>
    <form aria-label={`Knowledge for ${title}`} className="mt-5 flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(""); setSaved(false);
      try { const result = await saveDetail({ kind, entryId, ...value }); if (!result.ok) setError(result.error); else { setSaved(true); router.refresh(); } }
      catch { setError("Changes could not be saved. Please try again."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <Textarea label="Validated context and evidence" value={value.context} maxLength={100_000} rows={6} hint="Explain what you built or did, supported results, your contribution, and any limits on claims. Include the architecture explanation here." onChange={event => update({ context: event.target.value })} />
        {kind === "project" && <>
          <Textarea label="Architecture diagram — Mermaid source" value={value.architecture} maxLength={50_000} rows={6} hint="Store editable Mermaid source here. For a visual diagram preview, upload its PNG or JPEG export below." onChange={event => update({ architecture: event.target.value })} />
          <Input label="Architecture image" type="file" accept="image/png,image/jpeg" hint="PNG or JPEG, up to 512 KB. Saved with this project's KB context." onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
          {value.architectureImage && <div className="flex flex-col items-start gap-3"><Image unoptimized src={value.architectureImage} alt={`Architecture diagram for ${title}`} width={1000} height={700} className="h-auto max-h-[32rem] w-auto max-w-full rounded-card object-contain" /><Button type="button" variant="secondary" onClick={() => update({ architectureImage: "" })}>Remove image</Button></div>}
        </>}
        {kind === "experience" && <fieldset className="flex flex-wrap gap-5"><legend className="mb-3 text-sm font-medium">Include this role in</legend>
          <Checkbox label="SWE LaTeX" checked={value.includeSwe} onChange={event => update({ includeSwe: event.target.checked })} />
          <Checkbox label="Data LaTeX" checked={value.includeData} onChange={event => update({ includeData: event.target.checked })} />
        </fieldset>}
        <Button type="submit" className="self-start">{busy ? "Saving…" : "Save context"}</Button>
      </fieldset>
      {error && <p role="alert" className="text-error">{error}</p>}
      {saved && <p role="status">Context saved to your KB.</p>}
    </form>
  </details>;
}
