"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import type { DiscoveryView, IntakeInput, PostingState } from "@/lib/discovery/contracts";
import { addPosting, changeState, removeSelection, retryScan, scanNow, selectPostings, startSession, stopSession } from "./actions";
import { DiscoveryConfiguration } from "./discovery-config";
import { displayTime, eligible, PostingCard } from "./posting-card";

const EMPTY_INTAKE: IntakeInput = { url: "", jd: "", company: "", role: "" };
export function DiscoveryScreen({ view }: { view: DiscoveryView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [intake, setIntake] = useState(EMPTY_INTAKE);
  const [filter, setFilter] = useState<"ALL" | PostingState>("NEW");
  const [checked, setChecked] = useState<string[]>([]);
  const running = view.scans.some(scan => scan.status === "RUNNING" || scan.status === "QUEUED");
  const watching = running || view.config.enabled || Boolean(view.sessionUntil);
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [watching, router]);
  function run(operation: () => Promise<ActionResult<null>>, message: string, success?: () => void) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) { setNotice({ error: true, text: result.error }); return; }
        success?.(); setNotice({ error: false, text: message }); router.refresh();
      } catch { setNotice({ error: true, text: "The request could not be completed. Your input is still here; try again." }); }
    });
  }
  const postings = view.postings.filter(posting => filter === "ALL" || posting.state === filter);
  const selectedIds = postings.filter(posting => checked.includes(posting.id) && eligible(posting)).map(posting => posting.id);
  return <>
    <PageHeader title="Discover your next role" description="Find opportunities, compare them with your complete knowledge base, then choose which roles deserve a tailored resume. Discovery never starts tailoring automatically."
      actions={<Button variant="secondary" disabled={busy} onClick={() => router.refresh()}>Refresh results</Button>} />
    <div className="flex flex-col gap-7 p-5 sm:p-10">
      {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? "text-danger" : "text-ink"}>{notice.text}</p>}
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Run discovery</h2>
        <p className="text-sm text-muted">Quick sessions use your saved sources, model and interval. They run outside weekly windows too. At expiry, no new session scans start; a scan already running can finish.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={busy || running} onClick={() => run(() => scanNow({}), "Discovery scan queued.")}>{running ? "Scan in progress" : "Scan now"}</Button>
          {([1, 2, 3] as const).map(hours => <Button key={hours} variant="secondary" disabled={busy} onClick={() => run(() => startSession({ hours }), `${hours}-hour discovery session started.`)}>Run for {hours} {hours === 1 ? "hour" : "hours"}</Button>)}
          {view.sessionUntil && <Button variant="text" disabled={busy} onClick={() => run(() => stopSession({}), "Quick session stopped. Your weekly schedule is unchanged.")}>Stop quick session</Button>}
        </div>
        <p className="text-sm">Weekly schedule: {view.config.enabled ? "on" : "off"} · Quick session ends: {view.sessionUntil ? displayTime(view.sessionUntil) : "not active"} · Next check: {view.nextTickAt ? displayTime(view.nextTickAt) : "not scheduled"}</p>
      </Card>
      <DiscoveryConfiguration initial={view.config} configured={view.configured} busy={busy} run={run} />
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Add a role</h2><p className="text-sm text-muted">Paste a public posting link or the entire job description. Pasted text is used when both are supplied. This prepares a discovery finding, not an application.</p>
        <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); run(() => addPosting(intake), "Posting queued for discovery analysis.", () => setIntake(EMPTY_INTAKE)); }}>
          <Input label="Posting URL" type="url" value={intake.url} maxLength={4000} onChange={event => setIntake({ ...intake, url: event.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Company (optional)" value={intake.company} maxLength={2000} onChange={event => setIntake({ ...intake, company: event.target.value })} /><Input label="Role (optional)" value={intake.role} maxLength={2000} onChange={event => setIntake({ ...intake, role: event.target.value })} /></div>
          <Textarea label="Full job description" rows={7} value={intake.jd} maxLength={500_000} onChange={event => setIntake({ ...intake, jd: event.target.value })} />
          <div><Button type="submit" disabled={busy || (!intake.url.trim() && !intake.jd.trim())}>Analyze posting</Button></div>
        </form>
      </Card>
      <section className="flex flex-col gap-4" aria-labelledby="discovery-findings">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="discovery-findings" className="text-xl font-medium">Discovery findings</h2><p className="text-sm text-muted">Scores describe evidence in the whole KB. They are not final resume scores or submission analytics.</p></div><Select label="Show roles" value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setChecked([]); }}><option value="NEW">New</option><option value="SAVED">Saved</option><option value="DISMISSED">Dismissed</option><option value="ALL">All</option></Select></div>
        <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={busy || !postings.some(eligible)} onClick={() => setChecked(postings.filter(eligible).slice(0, 100).map(posting => posting.id))}>Select eligible roles</Button><Button variant="text" disabled={!checked.length || busy} onClick={() => setChecked([])}>Clear selection</Button><Button disabled={busy || !selectedIds.length} onClick={() => run(() => selectPostings({ ids: selectedIds }), "Roles added to the tailoring selection list.", () => setChecked([]))}>Select {selectedIds.length} for tailoring</Button></div>
        {!postings.length && <Card><p>No {filter === "ALL" ? "discovery" : filter.toLowerCase()} roles yet. Run a scan or add a posting.</p></Card>}
        {postings.map(posting => <PostingCard key={posting.id} posting={posting} checked={selectedIds.includes(posting.id)} busy={busy}
          onCheck={value => setChecked(previous => value ? [...new Set([...previous, posting.id])].slice(0, 100) : previous.filter(id => id !== posting.id))}
          onState={state => run(() => changeState({ ids: [posting.id], state }), "Role updated.")}
          onSelect={() => run(() => selectPostings({ ids: [posting.id] }), "Role added to the tailoring selection list.")} />)}
      </section>
      <Card className="flex flex-col gap-4"><h2 className="text-xl font-medium">Selected for tailoring</h2><p className="text-sm text-muted">Visit the <Link className="underline" href="/tailoring">tailoring queue</Link> to reorder waiting roles, follow progress and download verified documents.</p>
        {!view.selections.length ? <p>No roles selected yet.</p> : <ul className="flex flex-col gap-3">{view.selections.map(selection => <li key={selection.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><div><p className="font-medium">{selection.role || "Unknown role"} · {selection.company || "Unknown company"}</p><p className="text-sm text-muted">Selected {displayTime(selection.createdAt)}</p></div><Button variant="text" disabled={busy} onClick={() => run(() => removeSelection({ id: selection.id }), "Role removed from the tailoring selection list.")}>Remove {selection.role || "role"}</Button></li>)}</ul>}
      </Card>
      <Card className="flex flex-col gap-4"><h2 className="text-xl font-medium">Scan history</h2>{!view.scans.length && <p>No scans yet.</p>}{view.scans.map(scan => <details key={scan.id} className="border-t border-line pt-3"><summary className="cursor-pointer">{scan.status.toLowerCase()} · {displayTime(scan.createdAt)}{scan.stage ? ` · ${scan.stage}` : ""}</summary><div className="mt-3 flex flex-col gap-2 text-sm">{scan.error && <p className="text-danger">{scan.error}</p>}{scan.sourceResults.map((source, index) => <p key={index}>{source.source}: {source.error || `${source.found} postings found`}</p>)}{scan.finishedAt && <p>Finished {displayTime(scan.finishedAt)}</p>}{["FAILED", "INTERRUPTED"].includes(scan.status) && <div><Button variant="secondary" disabled={busy || running} onClick={() => run(() => retryScan({ id: scan.id }), "Scan queued for retry.")}>Retry scan</Button></div>}</div></details>)}</Card>
    </div>
  </>;
}
