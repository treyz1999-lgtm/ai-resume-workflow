"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { checkUpdates, resolveFinding } from "./actions";

export type ApplicationChoice = { id: string; company: string; role: string; sentAt: string | null };
export type StatusFindingView = {
  id: string; messageId: string; threadId: string; emailDate: string;
  company: string; role: string; summary: string; kind: string;
  result: string; applicationId: string | null; candidates: ApplicationChoice[];
};
const results: Record<string, string> = {
  APPLIED: "Updated", UNCHANGED: "No change needed", STALE: "Newer update already recorded",
  REVIEW: "Needs review", NO_MATCH: "No matching application", DISMISSED: "Dismissed",
};
const field = "rounded-control border border-line bg-surface px-3 py-2 text-ink";
const card = "rounded-panel border border-line-card bg-card p-6";

function Finding({ finding, applications, timeZone }: {
  finding: StatusFindingView; applications: ApplicationChoice[]; timeZone: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const choices = finding.candidates.length ? finding.candidates : applications;
  const needsReview = finding.result === "REVIEW" || finding.result === "NO_MATCH";
  function resolve(applicationId: string | null) {
    start(async () => {
      try {
        const result = await resolveFinding({ id: finding.id, applicationId });
        setMessage(result.ok ? (applicationId ? "Application update reviewed." : "Finding dismissed.") : result.error);
      } catch { setMessage("Could not confirm this update. Refresh to check the recorded result."); }
      router.refresh();
    });
  }
  const date = (value: string) => new Date(value).toLocaleDateString("en-US", { timeZone });
  return <tr className="border-t border-line align-top">
    <td className="py-4 pr-4">{finding.company || "Unknown"}</td>
    <td className="py-4 pr-4">{finding.role || "Unknown"}</td>
    <td className="max-w-md py-4 pr-4">
      <p>{finding.summary}</p>
      <a className="mt-2 inline-block text-sm underline" href={"https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(finding.threadId)} target="_blank" rel="noreferrer">View email thread</a>
    </td>
    <td className="whitespace-nowrap py-4 pr-4">{date(finding.emailDate)}</td>
    <td className="min-w-64 py-4">
      <p>{results[finding.result] ?? finding.result}</p>
      {finding.applicationId && <Link className="text-sm underline" href={"/applications/" + encodeURIComponent(finding.applicationId)}>View application</Link>}
      {needsReview && <div className="mt-3 flex flex-col gap-2">
        <label className="text-sm">Application for {finding.company || "this update"}
          <select className={field + " mt-1 block w-full"} value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
            <option value="">Select an application</option>
            {choices.map(application => <option key={application.id} value={application.id}>
              {application.company} · {application.role} · {application.sentAt ? application.sentAt.slice(0, 10) : "Date unknown"}
            </option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !selected} onClick={() => resolve(selected)}>Apply update</Button>
          <Button disabled={busy} variant="secondary" onClick={() => resolve(null)}>Dismiss</Button>
        </div>
      </div>}
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </td>
  </tr>;
}

export function UpdatesScreen({ findings, applications, connected, timeZone }: {
  findings: StatusFindingView[]; applications: ApplicationChoice[]; connected: boolean; timeZone: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  function check() {
    start(async () => {
      try {
        const result = await checkUpdates({});
        setWarnings(result.ok ? result.data.warnings : []);
        setMessage(result.ok
          ? `Reviewed ${result.data.reviewed} messages · ${result.data.included} findings · ${result.data.updated} applications updated · ${result.data.review} need review.`
          : result.error);
      } catch { setMessage("The check could not finish. Saved findings are shown below; try again to continue."); }
      router.refresh();
    });
  }
  return <>
    <PageHeader title="Application updates"
      description="Review recent Gmail correspondence and update confidently matched application attempts. Choose an application when a match needs review."
      actions={<Link href="/inbox" className={buttonClassName("secondary")}>Inbox</Link>} />
    <div className="space-y-5 px-5 pb-16 sm:px-10">
      <section className={card + " flex flex-wrap items-center gap-4"}>
        {connected ? <Button disabled={busy} onClick={check}>{busy ? "Checking updates…" : "Check updates"}</Button> :
          <Link className={buttonClassName("primary")} href="/settings?section=google">Connect Gmail</Link>}
        <p className="text-sm text-muted">Each check covers seven calendar days ago through today, inclusive. Previously recorded findings remain in this report.</p>
        {message && <p className="w-full" role="status">{message}</p>}
        {warnings.map((warning, index) => <p className="w-full" role="alert" key={index}>{warning}</p>)}
      </section>
      <section className={card + " overflow-x-auto"}>
        {findings.length ? <table className="w-full text-left text-sm">
          <caption className="sr-only">Application status findings, newest email first</caption>
          <thead><tr>{["Company", "Role", "Update", "Email date", "Tracker result"].map(label => <th className="pb-3 pr-4 font-medium" scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{findings.map(finding => <Finding key={finding.id} finding={finding} applications={applications} timeZone={timeZone} />)}</tbody>
        </table> : <p className="text-muted">No application updates have been recorded yet.</p>}
      </section>
    </div>
  </>;
}
