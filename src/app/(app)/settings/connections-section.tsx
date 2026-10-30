"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ConnectionView, LatexArtifact, LoginView, RunView } from "@/lib/execution/contracts";

import { SettingsSectionIntro } from "./settings-screen";

async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/execution/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The request could not be completed.");
  return data as T;
}

const active = (run: RunView) => run.status === "RUNNING" || run.status === "QUEUED";

export function ConnectionsSection() {
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [login, setLogin] = useState<LoginView | null>(null);
  const [model, setModel] = useState("");
  const [artifact, setArtifact] = useState<LatexArtifact | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [nextConnection, nextRuns] = await Promise.all([request<ConnectionView>("connection", undefined, signal), request<RunView[]>("runs", undefined, signal)]);
    if (signal?.aborted) return;
    setConnection(nextConnection);
    setRuns(nextRuns);
    setPollError(null);
    if (nextConnection.connected) setLogin(null);
    setModel((current) => nextConnection.models.some((item) => item.id === current) ? current : (nextConnection.models.find((item) => item.isDefault)?.id ?? nextConnection.models[0]?.id ?? ""));
  }, []);
  const fast = Boolean(login) || runs.some(active);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(controller.signal); }
      catch (problem) { if (!controller.signal.aborted) setPollError(problem instanceof Error ? problem.message : "Connection refresh failed."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, fast ? 1000 : 10_000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [fast, refresh]);

  const act = async (name: string, operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(name); setError(null);
    try { await operation(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "The operation failed."); }
    finally { setBusy(null); }
  };
  const updateRun = (next: RunView) => setRuns((current) => [next, ...current.filter((run) => run.id !== next.id)]);

  return (
    <>
      <SettingsSectionIntro title="Connections">Connect your ChatGPT plan to Codex and check the local document tools.</SettingsSectionIntro>
      {(error || pollError) && <p role="alert" className="rounded-card bg-warning-surface p-4 text-warning">{error ?? pollError}</p>}
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-medium">Codex with ChatGPT</h3>
        <p className="text-sm text-muted">Uses your eligible ChatGPT plan. This connection never falls back to API billing. Your existing API and local-model settings remain under AI provider.</p>
        <p role="status">{connection ? (connection.connected ? `Connected${connection.plan ? ` · ${connection.plan}` : ""}` : "Not connected") : "Checking connection…"}</p>
        {connection?.error && <p role="alert" className="text-sm text-warning">{connection.error}</p>}
        <div className="flex flex-wrap gap-3">
          {!connection?.connected && !login && <Button disabled={Boolean(busy)} onClick={() => void act("login", async () => setLogin(await request<LoginView>("login", {})))}>{busy === "login" ? "Starting sign-in…" : "Sign in with ChatGPT"}</Button>}
          {connection?.connected && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act("logout", async () => { await request("logout", {}); setLogin(null); await refresh(); })}>Sign out</Button>}
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act("refresh", refresh)}>Refresh connection</Button>
        </div>
        {login && <div className="rounded-card border border-line p-4 flex flex-col gap-3">
          <p>Open the sign-in page, enter this code, and finish signing in. This page will update when the connection is ready.</p>
          <p className="font-mono text-xl" aria-label="Sign-in code">{login.userCode}</p>
          <a href={login.verificationUrl} target="_blank" rel="noopener noreferrer" className="underline">Open ChatGPT sign-in</a>
          <p className="text-sm text-muted">If the code expires or sign-in is declined, cancel and start again.</p>
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act("cancel-login", async () => { await request("login/cancel", { loginId: login.loginId }); setLogin(null); })}>Cancel sign-in</Button>
        </div>}
        {connection?.connected && <>
          <Select label="Codex model" value={model} onChange={(event) => setModel(event.target.value)} disabled={Boolean(busy) || !connection.models.length}>
            {!connection.models.length && <option value="">No models available</option>}
            {connection.models.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " (default)" : ""}</option>)}
          </Select>
          <p className="text-sm text-muted">A successful test confirms access to the selected model. It uses a small amount of your plan allowance.</p>
          <Button className="self-start" disabled={Boolean(busy) || !model || runs.some(active)} onClick={() => void act("test", async () => updateRun(await request<RunView>("runs", { model })))}>Run connection test</Button>
        </>}
        <h4 className="font-medium">Usage limits</h4>
        {connection?.limits.length ? <ul className="space-y-3">{connection.limits.map((limit, index) => <li key={`${limit.name}-${index}`}>
          <span>{limit.name} · {Math.min(100, Math.max(0, limit.usedPercent))}% used · {limit.windowMinutes} minute window</span>
          <progress className="block w-full" max={100} value={Math.min(100, Math.max(0, limit.usedPercent))} aria-label={`${limit.name} usage`} />
          {limit.resetsAt !== null && <span className="text-sm text-muted">Resets {new Date(limit.resetsAt * 1000).toLocaleString()}</span>}
        </li>)}</ul> : <p className="text-sm text-muted">Usage information is unavailable{connection?.connected ? "." : " until connected."}</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-medium">Connection tests</h3>
        <p className="text-sm text-muted">Tests use fictional project data. Interrupted or blocked tests stay here so you can resume them.</p>
        {!runs.length && <p>No tests yet.</p>}
        {runs.map((run) => <article key={run.id} aria-label={`Connection test ${run.id}`} className="rounded-card border border-line p-4 flex flex-col gap-3">
          <p className="font-medium">{run.status.replaceAll("_", " ")} · {run.model ?? "Default model"}</p>
          {run.stage && <p role="status">{run.stage}</p>}
          {run.error && <p role="alert" className="text-warning">{run.error}</p>}
          {run.output && <pre aria-label="Test output" className="whitespace-pre-wrap break-words text-sm max-h-64 overflow-auto">{run.output}</pre>}
          {run.status === "COMPLETED" && <p className="text-sm text-success">Structured response verified.</p>}
          <div className="flex gap-3">
            {active(run) && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act(`cancel-${run.id}`, async () => updateRun(await request<RunView>(`runs/${run.id}/cancel`, {})))}>Cancel test</Button>}
            {["BLOCKED", "INTERRUPTED", "FAILED", "CANCELLED"].includes(run.status) && <Button variant="secondary" disabled={Boolean(busy) || !connection?.connected || runs.some(active)} onClick={() => void act(`resume-${run.id}`, async () => updateRun(await request<RunView>(`runs/${run.id}/resume`, {})))}>Resume test</Button>}
          </div>
        </article>)}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-medium">Local PDF tools</h3>
        <p className="text-sm text-muted">Compile a fictional one-page LaTeX document locally, then inspect its PDF and editable source. This does not call an AI provider.</p>
        <Button className="self-start" disabled={Boolean(busy)} onClick={() => void act("latex", async () => setArtifact(await request<LatexArtifact>("latex/sample", {})))}>{busy === "latex" ? "Compiling sample…" : "Compile sample PDF"}</Button>
        {artifact && <>
          <p role="status">Verified {artifact.pages} page{artifact.pages === 1 ? "" : "s"}; readable PDF text found.</p>
          <div className="flex gap-4"><a href={artifact.pdfUrl} download="sample.pdf" className="underline">Download PDF</a><a href={artifact.sourceUrl} download="sample.tex" className="underline">Download LaTeX source</a></div>
          <iframe title="Compiled sample PDF" src={artifact.pdfUrl} className="h-[650px] w-full rounded-card border border-line" />
          <details><summary className="cursor-pointer">Extracted PDF text</summary><pre className="whitespace-pre-wrap text-sm">{artifact.text}</pre></details>
        </>}
      </Card>
    </>
  );
}
