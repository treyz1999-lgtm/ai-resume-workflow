import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { createTestClient } from "@/test/db";
import { resetDatabase } from "@/test/db";
import { claimScan, enqueueScan, json, LEASE_MS, owned, rememberPosting, renewLease, retryScan } from "./store";
import { DEFAULT_DISCOVERY_CONFIG, type DiscoveryInput } from "./contracts";
import { loadDiscovery, removeTailoringSelection, saveDiscoveryConfig, selectForTailoring, setDiscoveryState, startDiscoverySession, stopDiscoverySession } from "./service";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => { const { createTestClient } = await import("@/test/db"); db.client = createTestClient(); return { prisma: db.client }; });
const prisma = () => db.client!;
beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());
const now = new Date("2026-11-03T17:00:00.000Z");
const posting: DiscoveryInput = { source: "JSEARCH", externalId: "example-role", url: "https://example.com/jobs/1", company: "Fictional Labs", role: "Engineer", jd: "SQL required", complete: true,
  postingEvidence: { kind: "absolute", raw: "November 1", date: "2026-11-01T00:00:00.000Z", observedAt: now.toISOString(), earliest: null, latest: null, reposted: false } };

it("concurrent manual requests and claims create one active scan and no applications", async () => {
  await Promise.all(Array.from({ length: 5 }, () => enqueueScan(undefined, now)));
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimScan(now)));
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await prisma().discoveryScan.count()).toBe(1);
  expect(await prisma().application.count()).toBe(0);
  expect(await prisma().document.count()).toBe(0);
});
it("intake is durable, rejects busy without replacing input, and retries its same failed row", async () => {
  const input = { url: "", jd: "Fictional full job description", company: "Example", role: "Engineer" };
  await enqueueScan(input, now);
  await expect(enqueueScan({ ...input, jd: "Second" }, now)).rejects.toThrow("busy");
  const scan = await claimScan(now);
  expect(scan?.input).toEqual(input);
  await prisma().discoveryScan.update({ where: { id: scan!.id }, data: { status: "FAILED", owner: null } });
  await retryScan(scan!.id, now);
  expect((await claimScan(now))?.id).toBe(scan!.id);
  expect(await prisma().discoveryScan.count()).toBe(1);
});
it("leases expire and fence stale writers; retry retains saved checkpoints", async () => {
  await enqueueScan(undefined, now);
  const scan = (await claimScan(now))!;
  await prisma().discoveryScan.update({ where: { id: scan.id }, data: { checkpoint: { items: [] } } });
  const late = new Date(now.getTime() + LEASE_MS + 1);
  expect(await renewLease(scan.id, scan.owner!, late)).toBe(false);
  await expect(owned(scan.id, scan.owner!, async tx => tx.discoveryPosting.deleteMany(), late)).rejects.toThrow("lease lost");
  expect(await claimScan(late)).toBeNull();
  expect(await prisma().discoveryScan.findUnique({ where: { id: scan.id } })).toMatchObject({ status: "INTERRUPTED", checkpoint: { items: [] } });
  await retryScan(scan.id, late);
  expect((await claimScan(late))?.owner).not.toBe(scan.owner);
});
it("scheduling starts off, skips backlog, and prevents a queued session scan starting after expiry", async () => {
  expect(await claimScan(now)).toBeNull();
  await prisma().discoveryControl.create({ data: { id: "discovery", config: json(DEFAULT_DISCOVERY_CONFIG), nextTickAt: new Date("2020-01-01"), sessionUntil: new Date(now.getTime() + 1000) } });
  const scan = (await claimScan(now))!;
  expect(scan.manual).toBe(false);
  expect((await prisma().discoveryControl.findUniqueOrThrow({ where: { id: "discovery" } })).nextTickAt?.toISOString()).toBe("2026-11-03T17:10:00.000Z");
  await prisma().discoveryScan.update({ where: { id: scan.id }, data: { status: "COMPLETED" } });
  expect(await claimScan(new Date(now.getTime() + 1000))).toBeNull();
  await prisma().discoveryScan.create({ data: { manual: false } });
  expect(await claimScan(new Date(now.getTime() + 1000))).toBeNull();
  expect(await prisma().discoveryScan.count({ where: { status: "INTERRUPTED" } })).toBe(1);
});
it("sightings deduplicate, confirmed repost dates return separately, and original evidence survives", async () => {
  const first = await prisma().$transaction(tx => rememberPosting(tx, posting, now));
  const second = await prisma().$transaction(tx => rememberPosting(tx, { ...posting, postingEvidence: { ...posting.postingEvidence, raw: "2 days ago" } }, now));
  expect(second.row.id).toBe(first.row.id);
  expect(second.row.sightings).toBe(2);
  expect(second.row.postingEvidence).toEqual(posting.postingEvidence);
  await setDiscoveryState([first.row.id], "DISMISSED");
  const repost = await prisma().$transaction(tx => rememberPosting(tx, { ...posting, postingEvidence: { ...posting.postingEvidence, date: "2026-11-03T00:00:00.000Z", reposted: true } }, now));
  expect(repost.row.id).not.toBe(first.row.id);
  expect(repost.row.state).toBe("NEW");
});
it("upgrades a snippet with complete intake and requires fresh analysis before selection", async () => {
  const observe = (input: DiscoveryInput) => prisma().$transaction(tx => rememberPosting(tx, input, now));
  const snippet = await observe({ ...posting, complete: false, jd: "Source preview" });
  await prisma().discoveryPosting.update({ where: { id: snippet.row.id }, data: { coverage: { score: 50 }, kbSnapshotId: "previous" } });
  const full = await observe({ ...posting, source: "TEXT", jd: "Full fictional job description" });
  expect(full.row).toMatchObject({ id: snippet.row.id, jd: "Full fictional job description", complete: true, coverage: null, kbSnapshotId: null, sightings: 2 });
  await expect(selectForTailoring([full.row.id])).rejects.toThrow("successful coverage");
  expect((await observe({ ...posting, complete: false, jd: "Another preview" })).row.jd).toBe(full.row.jd);
});
it("distinguishes a subsequent repost after an undated observation receives a confirmed posting date", async () => {
  const observe = (input: DiscoveryInput) => prisma().$transaction(tx => rememberPosting(tx, input, now));
  const undated = { ...posting.postingEvidence, raw: "", date: null, kind: "unknown" as const };
  const initial = await observe({ ...posting, postingEvidence: undated });
  const confirmed = await observe(posting);
  expect(confirmed.row.id).toBe(initial.row.id);
  expect(confirmed.row.postingEvidence).toEqual(undated);
  expect(confirmed.row.postedAt?.toISOString()).toBe(posting.postingEvidence.date);
  const repost = await observe({ ...posting, postingEvidence: { ...posting.postingEvidence, date: "2026-11-09T00:00:00.000Z" } });
  expect(repost.row.id).not.toBe(initial.row.id);
});
it("requires explicit selection and successful complete analysis; selection is idempotent and removable", async () => {
  const { row } = await prisma().$transaction(tx => rememberPosting(tx, posting, now));
  expect(await prisma().tailoringSelection.count()).toBe(0);
  await expect(selectForTailoring([row.id])).rejects.toThrow("successful coverage");
  await prisma().discoveryPosting.update({ where: { id: row.id }, data: { coverage: { score: 50 }, complete: true } });
  await Promise.all([selectForTailoring([row.id]), selectForTailoring([row.id])]);
  expect(await prisma().tailoringSelection.count()).toBe(1);
  const view = await loadDiscovery();
  expect(view.postings[0]).toMatchObject({ selected: true, role: "Engineer" });
  await removeTailoringSelection(view.selections[0].id);
  expect(await prisma().tailoringSelection.count()).toBe(0);
  await selectForTailoring([row.id]);
  await setDiscoveryState([row.id], "DISMISSED");
  expect(await prisma().tailoringSelection.count()).toBe(0);
  await expect(selectForTailoring([row.id])).rejects.toThrow("Restore dismissed");
  expect(await prisma().application.count()).toBe(0);
});
it("persists validated settings and quick sessions without enabling weekly scheduling", async () => {
  await saveDiscoveryConfig({ ...DEFAULT_DISCOVERY_CONFIG, intervalMinutes: 1, timeZone: "America/Phoenix" });
  await startDiscoverySession(2);
  let view = await loadDiscovery();
  expect(view.config).toMatchObject({ enabled: false, intervalMinutes: 1, timeZone: "America/Phoenix" });
  expect(Date.parse(view.sessionUntil!)).toBeGreaterThan(Date.now());
  await stopDiscoverySession();
  view = await loadDiscovery();
  expect(view.sessionUntil).toBeNull();
  await expect(saveDiscoveryConfig({ ...DEFAULT_DISCOVERY_CONFIG, intervalMinutes: 0 })).rejects.toThrow();
});
