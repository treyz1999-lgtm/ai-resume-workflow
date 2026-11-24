"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowPreferences } from "@/lib/knowledge-contracts";
import { savePreferences } from "./actions";

const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);

export function WorkflowPreferencesEditor({ initial, themes }: { initial: WorkflowPreferences; themes: { id: string; name: string }[] }) {
  const [discovery, setDiscovery] = useState(initial.discovery);
  const [lists, setLists] = useState({ roles: initial.discovery.roles.join("\n"), locations: initial.discovery.locations.join("\n"), workArrangements: initial.discovery.workArrangements.join("\n"), excludedCompanies: initial.discovery.excludedCompanies.join("\n"), excludedLocations: (initial.discovery.excludedLocations ?? []).join("\n") });
  const [tailoring, setTailoring] = useState(initial.tailoring);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return <form aria-label="Discovery and tailoring preferences" onChange={() => setSaved(false)} onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setSaved(false);
    try {
      const result = await savePreferences({ discovery: { ...discovery, roles: lines(lists.roles), locations: lines(lists.locations), workArrangements: lines(lists.workArrangements), excludedCompanies: lines(lists.excludedCompanies), excludedLocations: lines(lists.excludedLocations) }, tailoring });
      if (!result.ok) setError(result.error); else setSaved(true);
    } catch { setError("Preferences could not be saved. Please try again."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Discovery preferences</h2>
        <p className="text-sm text-muted">Role titles allow similar matches. Structured filters below apply to discovery results; free-text constraints provide additional search guidance. Unknown experience can be retained for your review.</p>
        <Textarea label="Preferred role titles" rows={3} value={lists.roles} hint="One per line. Similar titles can match; exact spelling is not required." onChange={event => setLists(current => ({ ...current, roles: event.target.value }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea label="Preferred locations" rows={3} value={lists.locations} hint="One per line." onChange={event => setLists(current => ({ ...current, locations: event.target.value }))} />
          <Textarea label="Work arrangements" rows={3} value={lists.workArrangements} hint="One per line, such as remote, hybrid or on-site." onChange={event => setLists(current => ({ ...current, workArrangements: event.target.value }))} />
          <Input label="Minimum salary" type="number" min={0} step="any" value={discovery.minimumSalary ?? ""} hint="Leave empty when unspecified; define salary period in constraints." onChange={event => setDiscovery(current => ({ ...current, minimumSalary: event.target.value === "" ? null : Number(event.target.value) }))} />
          <Input label="Salary currency" maxLength={3} value={discovery.salaryCurrency} onChange={event => setDiscovery(current => ({ ...current, salaryCurrency: event.target.value.toUpperCase() }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Experience level" value={discovery.experienceLevel ?? "any"} onChange={event => setDiscovery(current => ({ ...current, experienceLevel: event.target.value as "any" | "early-career" }))}>
            <option value="any">Any experience level</option><option value="early-career">Entry level / early career</option>
          </Select>
          <Input label="Maximum required experience (years)" type="number" min={0} max={50} step={1} value={discovery.maximumExperienceYears ?? ""} hint="Early career defaults to 2 years when blank and excludes senior/lead titles. Enter another limit to override." onChange={event => setDiscovery(current => ({ ...current, maximumExperienceYears: event.target.value === "" ? null : Number(event.target.value) }))} />
        </div>
        <Checkbox label="Include roles with unspecified experience" checked={discovery.includeUnknownExperience ?? true} onChange={event => setDiscovery(current => ({ ...current, includeUnknownExperience: event.target.checked }))} />
        <Textarea label="Excluded locations" rows={3} value={lists.excludedLocations} hint="One per line. Tucson also excludes nearby Tucson metro communities. Applies to the posting's stated location." onChange={event => setLists(current => ({ ...current, excludedLocations: event.target.value }))} />
        <Textarea label="Excluded companies" rows={3} value={lists.excludedCompanies} hint="One per line." onChange={event => setLists(current => ({ ...current, excludedCompanies: event.target.value }))} />
        <Textarea label="Explicit discovery constraints" rows={4} maxLength={10_000} value={discovery.constraints} hint="For example: location restrictions, work authorization, experience range, or salary period." onChange={event => setDiscovery(current => ({ ...current, constraints: event.target.value }))} />
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Tailoring defaults</h2>
        <p className="text-sm text-muted">LaTeX is the default. Auto lets the future tailoring agents choose SWE or Data from the role. You can choose either track explicitly.</p>
        <Select label="Resume track" value={tailoring.track} onChange={event => setTailoring(current => ({ ...current, track: event.target.value as WorkflowPreferences["tailoring"]["track"] }))}><option value="auto">Auto</option><option value="swe">SWE</option><option value="data">Data</option></Select>
        <Select label="Presentation override" value={tailoring.themeId ?? ""} onChange={event => setTailoring(current => ({ ...current, themeId: event.target.value || null }))}>
          <option value="">V5 LaTeX (default)</option>{themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name} — HTML theme</option>)}
        </Select>
        <Checkbox label="Generate a cover letter" checked={tailoring.coverLetter} onChange={event => setTailoring(current => ({ ...current, coverLetter: event.target.checked }))} />
      </Card>
      <Button type="submit" className="self-start">{busy ? "Saving…" : "Save preferences"}</Button>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-error">{error}</p>}
    {saved && <p role="status" className="mt-3">Preferences saved.</p>}
  </form>;
}
