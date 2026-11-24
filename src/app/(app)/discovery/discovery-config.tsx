"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { discoveryConfigSchema, type DiscoveryConfig } from "@/lib/discovery/contracts";
import type { ActionResult } from "@/lib/action";
import { saveConfig } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SOURCES = [{ id: "WEB", label: "V5 web search · Codex" }, { id: "JSEARCH", label: "JSearch" }, { id: "YC", label: "YC jobs" }, { id: "HN", label: "Hacker News hiring" }] as const;
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverZone = () => "UTC";

export function DiscoveryConfiguration({ initial, configured, busy, run }: {
  initial: DiscoveryConfig; configured: boolean; busy: boolean;
  run: (operation: () => Promise<ActionResult<null>>, message: string) => void;
}) {
  const [config, setConfig] = useState(initial);
  const [zoneEdited, setZoneEdited] = useState(configured);
  const [error, setError] = useState("");
  const systemZone = useSyncExternalStore(subscribe, browserZone, serverZone);
  const timeZone = zoneEdited ? config.timeZone : systemZone;
  const change = (patch: Partial<DiscoveryConfig>) => { setConfig(previous => ({ ...previous, ...patch })); setError(""); };
  return <Card className="flex flex-col gap-4">
    <h2 className="text-xl font-medium">Discovery schedule</h2>
    <p className="text-sm text-muted">Set role titles, locations and other preferences in your <Link href="/knowledge" className="underline">knowledge base</Link>. Similar titles can match. Searches only run while the application is running.</p>
    <form className="flex flex-col gap-5" onSubmit={event => {
      event.preventDefault();
      const parsed = discoveryConfigSchema.safeParse({ ...config, timeZone });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the discovery settings."); return; }
      run(() => saveConfig(parsed.data), "Discovery settings saved.");
    }}>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={event => change({ enabled: event.target.checked })} />Enable weekly schedule</label>
      <fieldset className="flex flex-wrap gap-3"><legend className="mb-2 text-sm font-medium">Days</legend>{DAYS.map((day, index) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.days.includes(index)} onChange={event => change({ days: event.target.checked ? [...config.days, index].sort() : config.days.filter(value => value !== index) })} />{day}</label>)}</fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Window starts" type="time" required value={config.startTime} onChange={event => change({ startTime: event.target.value })} />
        <Input label="Window ends" type="time" required value={config.endTime} onChange={event => change({ endTime: event.target.value })} />
        <Input label="Timezone" required value={timeZone} onChange={event => { setZoneEdited(true); change({ timeZone: event.target.value }); }} hint="IANA name, for example America/Phoenix. Initially uses your system timezone." />
        <Input label="Search country" required maxLength={2} value={config.country} onChange={event => change({ country: event.target.value.toLowerCase() })} hint="Two-letter code, for example us." />
      </div>
      <p className="text-sm text-muted">A window ending before it starts continues overnight. Equal start and end times mean the whole selected day. Missed scans are skipped after downtime.</p>
      <div className="flex flex-col gap-2"><label htmlFor="discovery-interval" className="text-sm font-medium">Scan interval: {config.intervalMinutes} {config.intervalMinutes === 1 ? "minute" : "minutes"}</label><input id="discovery-interval" type="range" min={1} max={60} value={config.intervalMinutes} onChange={event => change({ intervalMinutes: Number(event.target.value) })} /></div>
      <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium">Sources</legend>{SOURCES.map(source => <label className="flex items-center gap-2" key={source.id}><input type="checkbox" checked={config.sources.includes(source.id)} onChange={event => change({ sources: event.target.checked ? [...config.sources, source.id] : config.sources.filter(value => value !== source.id) })} />{source.label}</label>)}</fieldset>
      <p className="text-sm text-muted">V5 web search uses your Codex subscription to find public postings across job boards and employer career sites. It cannot access signed-in browser sessions; inaccessible boards are reported. JSearch optionally uses the key in <Link className="underline" href="/settings?section=jobs">Job search settings</Link>. YC and Hacker News use public sources. <Link href="/jobs?legacy=1" className="underline">Open legacy JSearch and search history</Link>.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Discovery model connection" value={config.provider} onChange={event => change({ provider: event.target.value as DiscoveryConfig["provider"] })}>
          <option value="codex">Codex · ChatGPT subscription</option><option value="configured">Configured API or local provider</option>
        </Select>
        <Input label="Codex model override" value={config.model} onChange={event => change({ model: event.target.value })} maxLength={160} disabled={config.provider !== "codex"} hint="Leave blank to use the Codex default." />
      </div>
      <p className="text-sm text-muted">Manage sign-in and models in <Link className="underline" href="/settings?section=connections">Connections</Link> and <Link className="underline" href="/settings?section=ai">AI provider settings</Link>. The selected connection is used without automatic fallback.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div><Button type="submit" disabled={busy}>Save discovery settings</Button></div>
    </form>
  </Card>;
}
