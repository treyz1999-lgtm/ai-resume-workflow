"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action";
import type { DocumentReview } from "@/lib/tailoring/document-review";
import type { RevisionRequest } from "@/lib/tailoring/revision-edit";
import { revise, submitDocuments } from "./actions";

const field = "block mt-1 w-full rounded-control border border-line bg-surface p-2 text-ink";
const kindName = (kind: string) => kind === "letter" ? "Cover letter" : "Resume";

function MatchReport({ report }: { report: Record<string, unknown> }) {
  const requirements = Array.isArray(report.requirements) ? report.requirements : [];
  return <div className="space-y-2">
    {typeof report.keywordCoverage === "number" && <p>Keyword coverage {report.keywordCoverage}%</p>}
    <ul className="space-y-3">{requirements.map((item, i) => <li key={i} className="border-t border-line pt-2">
      <p className="font-medium">{item.jdQuote}</p>
      <p>{item.importance} · {item.alignment}</p>
      <p>{item.explanation}</p>
      {item.pdfQuote && <p>Resume: {item.pdfQuote}</p>}{item.kbQuote && <p>KB: {item.kbQuote}</p>}
    </li>)}</ul>
  </div>;
}

function RevisionDocument({ doc }: { doc: DocumentReview["revisions"][number] }) {
  const verified = doc.matchReport?.verified === true;
  const url = "/api/tailoring/revisions/" + encodeURIComponent(doc.id);
  return <section className="space-y-3">
    <h3 className="text-lg font-medium">{kindName(doc.kind)}</h3>
    {verified && <>
      <Image unoptimized src={url + "?file=preview&inline=1"} alt={kindName(doc.kind) + " rendered PDF page"} width={850} height={1100} className="h-auto w-full max-w-[850px] border border-line" />
      <div className="flex flex-wrap gap-4">
        <a className="underline" href={url + "?file=pdf&inline=1"} target="_blank" rel="noreferrer">Open PDF</a>
        <a className="underline" href={url + "?file=pdf"}>Download PDF</a>
        <a className="underline" href={url + "?file=source"}>Editable source</a>
      </div>
    </>}
    <details><summary>Verification results</summary>
      <p>{verified ? "Passed" : "Verification incomplete or failed"}</p>
      {doc.matchReport?.problems?.map((p, i) => <p key={i}>{p}</p>)}
      <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(doc.verification, null, 2)}</pre>
    </details>
    {doc.kind === "resume" && <>
      <details><summary>Evidence mappings</summary><dl>{doc.evidence.map((e, i) =>
        <div key={i} className="mt-2"><dt>{e.text}</dt><dd className="text-sm text-muted">{e.quote} · {e.sourceId}</dd></div>
      )}</dl></details>
      {doc.matchReport?.report && <details><summary>Match report{doc.matchReport.score != null && " · " + doc.matchReport.score + "%"}</summary><MatchReport report={doc.matchReport.report} /></details>}
    </>}
  </section>;
}

export function ReviewScreen({ data, initialVersion = null }: { data: DocumentReview; initialVersion?: number | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const [generation, selectGeneration] = useState<number | null>(initialVersion);
  const selected = generation ?? data.generation;
  const [instruction, setInstruction] = useState("");
  const [claim, setClaim] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [includeLetter, setIncludeLetter] = useState(true);
  const running = ["QUEUED", "RUNNING"].includes(data.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [running, router]);
  const versions = Array.from(new Set([data.generation, ...data.history.map(h => h.generation), ...data.revisions.map(d => d.generation)])).sort((a,b) => b-a);
  const documents = data.revisions.filter(d => d.generation === selected);
  const resume = documents.find(d => d.kind === "resume" && d.matchReport?.verified);
  const letter = documents.find(d => d.kind === "letter" && d.matchReport?.verified);
  function perform(task: () => Promise<ActionResult<null>>, success: string) {
    start(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? success : result.error);
        if (result.ok) { selectGeneration(null); setEdited(null); setInstruction(""); }
      } catch { setMessage("Could not save. Refresh this review to see the latest version."); }
      router.refresh();
    });
  }
  function change(request: RevisionRequest) {
    perform(() => revise({ id: data.id, generation: data.generation, request }), "Revision queued for verification.");
  }
  const historical = data.history.find(h => h.generation === selected);
  return <>
    <PageHeader title={data.role || "Document review"} description={[data.company, data.stage].filter(Boolean).join(" · ")}
      actions={<Link href="/tailoring" className={buttonClassName("secondary")}>Tailoring queue</Link>} />
    <main className="grid gap-5 p-5 sm:p-10 xl:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
      <Card className="space-y-4">
        <label>Document version<select className={field} value={selected} onChange={e => selectGeneration(Number(e.target.value))}>
          {versions.map(v => <option key={v} value={v}>Version {v}{v === data.generation ? " · current" : ""}</option>)}
        </select></label>
        {documents.length === 0 && <p>{historical?.reason || data.error || data.stage}</p>}
        {documents.map(doc => <RevisionDocument key={doc.id} doc={doc} />)}
        {historical?.canRestore && <Button disabled={busy || running} variant="secondary" onClick={() => change({mode:"restore", generation:selected})}>Restore version {selected} and verify</Button>}
      </Card>
      <div className="space-y-5">
        {message && <p role="status">{message}</p>}
        {data.error && <p role="alert">{data.error}</p>}
        {data.applicationId ? <Card><Link className="underline" href={"/applications/" + data.applicationId}>View submitted application</Link></Card> :
        data.status === "PENDING" && resume && <Card className="space-y-3">
          <h2 className="text-xl">Mark submitted</h2><p>Record resume version {selected}{typeof resume.matchReport?.score === "number" && " · " + resume.matchReport.score + "% alignment"}.</p>
          <label>Submission date<input className={field} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          {letter && <label className="block"><input type="checkbox" checked={includeLetter} onChange={e => setIncludeLetter(e.target.checked)} /> Include cover letter version {selected}</label>}
          <Button disabled={busy || !date} onClick={() => perform(() => submitDocuments({ id:data.id, resume:resume.id, letter:includeLetter && letter ? letter.id : null, date }), "Submission recorded.")}>Mark submitted</Button>
        </Card>}
        {data.plan && <Card className="space-y-2"><h2 className="text-xl">Project selection</h2><p>{data.plan.rationale}</p>
          <ol className="list-decimal pl-5">{data.plan.selected.map(id => <li key={id}>{data.projectNames[id] ?? id}</li>)}</ol>
          {data.composition && selected === data.generation && <p>{data.composition}</p>}
          <details><summary>All projects considered</summary>{data.plan.reviewed.map(p => <p className="mt-2" key={p.id}><strong>{data.projectNames[p.id] ?? p.id}</strong> · {p.reason}</p>)}</details>
        </Card>}
        {!running && data.plan && selected === data.generation && <Card className="space-y-4">
          <h2 className="text-xl">Revise documents</h2>
          <label>Refinement request<textarea className={field} rows={3} maxLength={3000} value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
          <Button disabled={busy || !instruction.trim()} onClick={() => change({mode:"chat",instruction})}>Request revision</Button>
          {data.claims.length > 0 && <details><summary>Edit a statement</summary>
            <label>Statement<select className={field} value={claim} onChange={e => {setClaim(Number(e.target.value));setEdited(null);}}>
              {data.claims.map((c,i) => <option key={i} value={i}>{c.text}</option>)}
            </select></label>
            <p className="my-2 text-sm">KB evidence · {data.claims[claim]?.quote}</p>
            <label>Wording<textarea className={field} rows={3} maxLength={3000} value={edited ?? data.claims[claim]?.text ?? ""} onChange={e => setEdited(e.target.value)} /></label>
            <Button disabled={busy || !edited?.trim() || edited === data.claims[claim]?.text} onClick={() => change({mode:"manual",index:claim,text:edited!})}>Save and verify</Button>
          </details>}
        </Card>}
        {data.history.length > 0 && <Card className="space-y-2"><h2 className="text-xl">Revision history</h2>{data.history.toReversed().map(h => <div key={h.generation}><button className="underline" onClick={() => selectGeneration(h.generation)}>Version {h.generation}</button>{h.reason && <p>{h.reason}</p>}</div>)}</Card>}
      </div>
    </main>
  </>;
}
