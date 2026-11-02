import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/session";
import { captureKnowledgeSnapshot, loadKnowledgeEditor, loadWorkflowPreferences } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";
import { loadThemes } from "@/lib/theme-data";
import { KnowledgeEntry } from "./knowledge-entry";
import { WorkflowPreferencesEditor } from "./preferences-editor";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ snapshot?: string }> }) {
  await verifySession();
  const [latest, preferences, themes, query] = await Promise.all([
    captureKnowledgeSnapshot(), loadWorkflowPreferences(), loadThemes(), searchParams,
  ]);
  const [editor, historical] = await Promise.all([
    loadKnowledgeEditor(),
    query.snapshot ? prisma.knowledgeSnapshot.findUnique({ where: { id: query.snapshot } }) : Promise.resolve(null),
  ]);
  const snapshot = historical ?? latest;
  return <>
    <PageHeader title="Your knowledge base" description="Your profile, work history and projects are the source of truth for tailoring. Add validated context here; saved resume uploads stay in a separate reference library."
      actions={<><Link className={buttonClassName("secondary")} href="/profile">Edit profile</Link><Link className={buttonClassName("secondary")} href="/library">Resume library</Link></>} />
    <div className="flex flex-col gap-8 p-5 sm:p-10">
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Project library</h2>
        <p className="text-sm text-muted">Create projects and maintain their names, dates, links and bullets in <Link className="underline" href="/profile?section=projects">Profile → Projects</Link>. Add the architecture, evidence, ownership boundaries and supporting context below.</p>
        {!editor.projects.length && <p>No projects yet. Add a project in your profile to begin.</p>}
        {editor.projects.map(project => <KnowledgeEntry key={project.id} kind="project" entryId={project.id} title={project.name || "Untitled project"}
          initial={editor.details.find(detail => detail.kind === "project" && detail.entryId === project.id)} />)}
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Work history context</h2>
        <p className="text-sm text-muted">Maintain employers, titles, locations and dates in <Link className="underline" href="/profile?section=experience">Profile → Experience</Link>. Choose which roles each LaTeX variant may include.</p>
        {!editor.experience.length && <p>No work history yet. Add a role in your profile to begin.</p>}
        {editor.experience.map(role => <KnowledgeEntry key={role.id} kind="experience" entryId={role.id} title={[role.role, role.company].filter(Boolean).join(" · ") || "Untitled role"}
          initial={editor.details.find(detail => detail.kind === "experience" && detail.entryId === role.id)} />)}
      </Card>
      <WorkflowPreferencesEditor initial={preferences} themes={themes.map(({ id, name }) => ({ id, name }))} />
      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-medium">Complete KB and history</h2>
        <p className="text-sm text-muted">Opening this page captures the latest complete profile and context when they have changed. Earlier versions remain unchanged. A tailoring run will capture the latest complete KB when it starts.</p>
        {query.snapshot && !historical && <p role="alert">That snapshot was not found. Showing the current version.</p>}
        <p>Viewing version {snapshot.version}{snapshot.id === latest.id ? " (current)" : " (historical)"}</p>
        <details><summary className="cursor-pointer font-medium">Read the complete snapshot</summary><pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-card border border-line p-4 text-xs" aria-label="Complete knowledge snapshot">{JSON.stringify(snapshot.payload, null, 2)}</pre></details>
        <nav aria-label="Knowledge snapshot history" className="flex flex-wrap gap-3">
          {editor.snapshots.map(item => <Link key={item.id} href={`/knowledge?snapshot=${encodeURIComponent(item.id)}`} aria-current={item.id === snapshot.id ? "page" : undefined} className="rounded-card border border-line px-3 py-2 text-sm underline">Version {item.version} · {item.createdAt.toISOString().slice(0, 10)}</Link>)}
        </nav>
      </Card>
    </div>
  </>;
}
