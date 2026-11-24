import "server-only";
import { z } from "zod";
import type { DiscoveryScan } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action";
import { captureKnowledgeSnapshot, loadWorkflowPreferences } from "@/lib/knowledge";
import { discoveryPreferencesSchema } from "@/lib/knowledge-contracts";
import { prisma } from "@/lib/prisma";
import { analyzePosting } from "./analysis";
import { collectDiscovery, resolveIntake } from "./sources";
import { discoveryConfigSchema, discoveryInputSchema, intakeSchema, type DiscoveryAnalysis, type DiscoveryInput, type SourceResult } from "./contracts";
import type { DiscoveryPreferences } from "../knowledge-contracts";
import { coverageReport } from "./coverage";
import { matchesPreferences } from "./preferences";
import { claimScan, configFrom, json, owned, rememberPosting, renewLease } from "./store";

// Config is an immutable envelope, so retries use both the same provider and discovery preferences.
const contextSchema = z.object({ discovery: discoveryConfigSchema, preferences: discoveryPreferencesSchema });
const checkpointSchema = z.object({ items: z.array(z.object({ posting: discoveryInputSchema, id: z.string().optional(), done: z.boolean() })) });
type Checkpoint = z.infer<typeof checkpointSchema>;
const safeError = (error: unknown) => error instanceof ActionError ? error.message : "Discovery could not complete this step. Check your connection and retry the saved scan.";
function eligibleFinding(fields: DiscoveryAnalysis["extracted"], row: { company: string; role: string; jd: string }, preferences: DiscoveryPreferences) {
  return matchesPreferences({ company: fields.company ?? row.company, role: fields.role ?? row.role,
    location: [fields.location, fields.arrangement].filter(Boolean).join(" · "), remote: fields.arrangement?.toLowerCase() === "remote" ? true : null,
    salary: fields.salaryOriginal ?? "", jd: row.jd }, preferences);
}

/** Durable per-posting checkpoints and lease fencing make a retry reuse its observations. */
export async function executeScan(scan: DiscoveryScan): Promise<void> {
  const owner = scan.owner!;
  const abort = new AbortController();
  let renewing = false;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewLease(scan.id, owner).then(ok => { if (!ok) abort.abort(); }).catch(() => abort.abort()).finally(() => { renewing = false; });
  }, 1_000);
  timer.unref?.();
  const write = <T>(work: Parameters<typeof owned<T>>[2]) => owned(scan.id, owner, work);
  try {
    let config = scan.config ? contextSchema.parse(scan.config) : null;
    let snapshot = scan.kbSnapshotId ? await prisma.knowledgeSnapshot.findUniqueOrThrow({ where: { id: scan.kbSnapshotId } }) : null;
    if (!config || !snapshot) {
      const [control, preferences, captured] = await Promise.all([
        prisma.discoveryControl.findUnique({ where: { id: "discovery" } }), loadWorkflowPreferences(), captureKnowledgeSnapshot(),
      ]);
      config ??= { discovery: configFrom(control?.config), preferences: preferences.discovery };
      snapshot ??= captured;
      await write(tx => tx.discoveryScan.update({ where: { id: scan.id }, data: { config: json(config), kbSnapshotId: snapshot!.id, stage: "Finding postings" } }));
    }
    let checkpoint: Checkpoint;
    if (scan.checkpoint) checkpoint = checkpointSchema.parse(scan.checkpoint);
    else {
      let postings: DiscoveryInput[], sources: SourceResult[];
      if (scan.input) {
        const posting = await resolveIntake(intakeSchema.parse(scan.input), abort.signal);
        postings = [posting]; sources = [{ source: posting.source, found: 1, error: null }];
      } else {
        const collected = await collectDiscovery(config.discovery, config.preferences, abort.signal);
        postings = collected.postings; sources = collected.sources;
        if (sources.length > 0 && sources.every(result => result.error !== null) && postings.length === 0) {
          await write(tx => tx.discoveryScan.update({ where: { id: scan.id }, data: { sourceResults: json(sources) } }));
          // Leave collection uncheckpointed so retry actually asks the sources again.
          throw new ActionError("Every selected source failed. Check the source results and retry this scan.");
        }
      }
      checkpoint = { items: postings.map(posting => ({ posting: discoveryInputSchema.parse(posting), done: false })) };
      await write(tx => tx.discoveryScan.update({ where: { id: scan.id }, data: { checkpoint: json(checkpoint), sourceResults: json(sources) } }));
    }
    let failed = 0;
    for (let index = 0; index < checkpoint.items.length; index++) {
      if (abort.signal.aborted) throw new Error("Discovery lease lost.");
      const item = checkpoint.items[index];
      if (item.done) continue;
      // Observation and its checkpoint are one transaction: a crash cannot double the sighting.
      if (!item.id) await write(async tx => {
        const saved = await rememberPosting(tx, item.posting, new Date());
        item.id = saved.row.id;
        await tx.discoveryScan.update({ where: { id: scan.id }, data: { checkpoint: json(checkpoint), stage: `Reviewing posting ${index + 1} of ${checkpoint.items.length}` } });
      });
      const row = await prisma.discoveryPosting.findUniqueOrThrow({ where: { id: item.id } });
      const alreadyAnalyzed = row.kbSnapshotId === snapshot.id && row.coverage !== null && !row.analysisError;
      if (row.state === "DISMISSED" || alreadyAnalyzed) {
        item.done = true;
        await write(async tx => {
          if (!scan.input && alreadyAnalyzed && row.extracted && row.state === "NEW"
            && !eligibleFinding(row.extracted as DiscoveryAnalysis["extracted"], row, config!.preferences)) {
            await tx.discoveryPosting.update({ where: { id: row.id }, data: { state: "DISMISSED" } });
          }
          await tx.discoveryScan.update({ where: { id: scan.id }, data: { checkpoint: json(checkpoint) } });
        });
        continue;
      }
      try {
        const result = await analyzePosting({ ...item.posting, company: row.company, role: row.role, jd: row.jd, complete: row.complete }, snapshot.payload, config.discovery, abort.signal);
        const eligible = Boolean(scan.input) || eligibleFinding(result.extracted, row, config.preferences);
        item.done = true;
        await write(async tx => {
          await tx.discoveryPosting.update({ where: { id: row.id }, data: { extracted: json(result.extracted), coverage: json(coverageReport(result)), kbSnapshotId: snapshot.id,
            company: row.company || result.extracted.company || "", role: row.role || result.extracted.role || "", analysisError: null,
            ...(!eligible && row.state === "NEW" ? { state: "DISMISSED" } : {}) } });
          await tx.discoveryScan.update({ where: { id: scan.id }, data: { checkpoint: json(checkpoint) } });
        });
      } catch (error) {
        item.done = false;
        failed++;
        await write(tx => tx.discoveryPosting.update({ where: { id: row.id }, data: { analysisError: safeError(error) } }));
      }
    }
    await write(tx => tx.discoveryScan.update({ where: { id: scan.id }, data: {
      status: failed ? "FAILED" : "COMPLETED", stage: failed ? "Some coverage analyses need retry" : "Discovery complete",
      error: failed ? `${failed} posting analysis${failed === 1 ? "" : "es"} could not complete. Retry uses the saved KB and descriptions.` : null,
      owner: null, leaseUntil: null, finishedAt: new Date(),
    } }));
  } catch (error) {
    // If the lease expired, its replacement owns recovery; stale code cannot change status.
    await write(tx => tx.discoveryScan.update({ where: { id: scan.id }, data: { status: "FAILED", error: safeError(error), owner: null, leaseUntil: null, finishedAt: new Date() } })).catch(() => undefined);
  } finally { clearInterval(timer); abort.abort(); }
}

export async function discoveryTick(now = new Date()): Promise<boolean> {
  const scan = await claimScan(now);
  if (!scan) return false;
  await executeScan(scan);
  return true;
}

const state = globalThis as unknown as { discoveryTimer?: ReturnType<typeof setInterval>; discoveryTickRunning?: boolean };
/** Database claims protect multi-process restarts; the local guard prevents redundant concurrent polling. */
export function startDiscoverySchedule(): void {
  if (state.discoveryTimer) return;
  const check = () => {
    if (state.discoveryTickRunning) return;
    state.discoveryTickRunning = true;
    void discoveryTick().catch(() => { console.error("[discovery] Scheduler check failed; it will retry."); }).finally(() => { state.discoveryTickRunning = false; });
  };
  state.discoveryTimer = setInterval(check, 5_000);
  state.discoveryTimer.unref?.();
  check();
}
