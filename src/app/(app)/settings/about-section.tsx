"use client";

import { Card } from "@/components/ui/card";
import type { Release } from "@/lib/releases";
import { SettingsSectionIntro } from "./settings-screen";

export type AboutFacts = { label: string; value: string }[];
// Retain the view contracts for existing callers and imported settings.
export type UpdatesView = { daily: boolean; available: Release | null };
export type UsagePingView = {
  host: string;
  choice: "on" | "off" | null;
  source: "env" | "app" | null;
  id: string | null;
  production: boolean;
};

export function AboutSection({ facts }: { facts: AboutFacts; usagePing: UsagePingView; updates: UpdatesView }) {
  return (
    <>
      <SettingsSectionIntro title="About this install">Free and open source. Local installation.</SettingsSectionIntro>
      <Card padding="none" className="px-7 py-2">
        <dl>
          {facts.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 border-t border-line py-3.5 text-sm first:border-t-0">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-mono text-[13px] [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <p className="text-meta text-muted">Upstream usage telemetry and update checks are disabled in AI Resume Workflow. Update this fork using its installation instructions.</p>
    </>
  );
}
