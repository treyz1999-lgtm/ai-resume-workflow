"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action";
import type { QueueView } from "@/lib/tailoring/contracts";
import { cancel, move, remove, retry, setPaused } from "./actions";

type QueueRow = QueueView["rows"][number];
const jobName = (row: QueueRow) => [row.role || "Untitled role", row.company].filter(Boolean).join(" · ");

function Documents({ documents }: { documents: QueueRow["documents"] }) {
  return <ul className="flex flex-col gap-2">{documents.map(doc => {
    const path = "/api/tailoring/revisions/" + encodeURIComponent(doc.id);
    return <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-medium">{doc.kind === "letter" ? "Cover letter" : "Resume"}</span>
      <a className="underline" href={path + "?file=pdf"}>Download PDF</a>
      <a className="underline" href={path + "?file=source"}>Editable source</a>
      <a className="underline" href={path + "?file=report"}>Match report</a>
      <a className="underline" href={path + "?file=verification"}>Verification record</a>
    </li>;
  })}</ul>;
}

export function TailoringScreen({ view }: { view: QueueView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
  const waiting = view.rows.filter(row => row.status === "QUEUED").sort((a, b) => a.position - b.position);
  const active = view.rows.filter(row => row.status === "RUNNING");
  const pending = view.rows.filter(row => row.status === "PENDING");
  const interrupted = view.rows.filter(row => row.status === "FAILED" || row.status === "CANCELLED");
  const watching = active.length > 0 || (!view.paused && waiting.length > 0);
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [router, watching]);
  function update(task: () => Promise<ActionResult<null>>, message: string) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await task();
        setNotice(result.ok ? { error: false, message } : { error: true, message: result.error });
      } catch {
        setNotice({ error: true, message: "Could not update the queue. Refresh to check its current state." });
      }
      router.refresh();
    });
  }
  return <>
    <PageHeader title="Tailoring queue" description="Prepare the roles you select in Discovery, one application at a time."
      actions={<Link href="/discovery" className={buttonClassName("secondary")}>Open Discovery</Link>} />
    <div className="flex flex-col gap-6 p-5 sm:p-10">
      {notice && <p role={notice.error ? "alert" : "status"}>{notice.message}</p>}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-medium">In progress</h2>
          <Button variant="secondary" disabled={busy} onClick={() => update(() => setPaused({ paused: !view.paused }), view.paused ? "Queue resumed." : "Queue paused.")}>
            {view.paused ? "Resume queue" : "Pause queue"}
          </Button>
        </div>
        {view.paused && <p className="text-sm text-muted">Queue paused. An active preparation can finish while waiting roles stay in place.</p>}
        {active.length === 0 && <p className="text-sm text-muted">No active preparation.</p>}
        {active.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-medium">{jobName(row)}</p><p role="status" className="text-sm text-muted">{row.stage}</p></div>
          <Button variant="danger-outline" disabled={busy} onClick={() => update(() => cancel({ id: row.id }), "Cancellation requested.")}>Cancel preparation</Button>
        </div>)}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-medium">Waiting ({waiting.length})</h2>
        {waiting.length === 0 && <p className="text-sm text-muted">Select roles in Discovery to add them here.</p>}
        <ol className="flex flex-col gap-3">{waiting.map((row, index) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <span>{index + 1}. {jobName(row)}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" aria-label={"Move " + jobName(row) + " up"} disabled={busy || index === 0} onClick={() => update(() => move({ id: row.id, direction: -1 }), "Queue order updated.")}>Move up</Button>
            <Button size="sm" variant="secondary" aria-label={"Move " + jobName(row) + " down"} disabled={busy || index === waiting.length - 1} onClick={() => update(() => move({ id: row.id, direction: 1 }), "Queue order updated.")}>Move down</Button>
            <Button size="sm" variant="danger-text" aria-label={"Remove " + jobName(row)} disabled={busy} onClick={() => update(() => remove({ id: row.id }), "Role removed from the queue.")}>Remove</Button>
          </div>
        </li>)}</ol>
      </Card>
      {!!interrupted.length && <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Needs attention</h2>
        {interrupted.map(row => <div key={row.id} className="flex flex-col items-start gap-2 border-t border-line pt-3">
          <p className="font-medium">{jobName(row)}</p>
          <p className="text-sm text-muted">{row.status === "CANCELLED" ? "Cancelled" : "Preparation stopped"}{row.stage ? " · " + row.stage : ""}</p>
          {row.error && <p className="text-sm">{row.error}</p>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => update(() => retry({ id: row.id }), "Preparation queued for retry.")}>Retry preparation</Button>
        </div>)}
      </Card>}
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Pending submission ({pending.length})</h2>
        {!pending.length && <p className="text-sm text-muted">Verified documents appear here for your review.</p>}
        {pending.map(row => <div key={row.id} className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="font-medium">{jobName(row)}</p>
          <p className="text-sm text-muted">Verified{row.score !== null && " · Resume evidence alignment " + row.score + "%"}</p>
          <Documents documents={row.documents} />
        </div>)}
      </Card>
    </div>
  </>;
}
