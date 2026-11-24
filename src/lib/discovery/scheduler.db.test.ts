import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetDatabase, type createTestClient } from "@/test/db";
import type { DiscoveryAnalysis, DiscoveryInput } from "./contracts";
import { enqueueScan, retryScan } from "./store";
import { discoveryTick } from "./scheduler";
import { collectDiscovery, resolveIntake } from "./sources";
import { analyzePosting } from "./analysis";
import { stopDiscovery } from "./service";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("./sources", () => ({ collectDiscovery: vi.fn(), resolveIntake: vi.fn() }));
vi.mock("./analysis", () => ({ analyzePosting: vi.fn() }));
const prisma = () => db.client!;
const posting: DiscoveryInput = {
  source: "TEXT", externalId: "sql-role", company: "Example", role: "Analyst", url: "", jd: "SQL is required.", complete: true,
  postingEvidence: { raw: "", kind: "unknown", observedAt: "2026-11-10T10:00:00.000Z", date: null, earliest: null, latest: null, reposted: false },
};
const result: DiscoveryAnalysis = {
  extracted: { company: "Example", role: "Analyst", track: "data", location: null, arrangement: null, salaryOriginal: null, salaryMin: null,
    salaryMax: null, salaryCurrency: null, salaryPeriod: null, experienceOriginal: null, experienceBand: null, requisition: null, postingDateOriginal: null },
  requirements: [{ text: "SQL", jdQuote: "SQL is required.", importance: "core", evidence: "absent", kbQuotes: [], explanation: "No evidence." }],
  keywords: [{ keyword: "SQL", covered: false }],
};
beforeEach(async () => { vi.resetAllMocks(); await resetDatabase(prisma()); });
afterAll(() => prisma().$disconnect());

it("stopping aborts an in-flight model request and cannot publish a late result", async () => {
  vi.mocked(resolveIntake).mockResolvedValue(posting);
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let receivedSignal: AbortSignal | undefined;
  vi.mocked(analyzePosting).mockImplementation(async (_posting, _kb, _config, signal) => {
    receivedSignal = signal;
    entered();
    await new Promise<void>(resolve => signal!.addEventListener("abort", () => resolve(), { once: true }));
    return result;
  });
  await enqueueScan({ url: "", jd: posting.jd, role: posting.role, company: posting.company });
  const running = discoveryTick();
  await started;
  await stopDiscovery();
  await running;
  expect(receivedSignal?.aborted).toBe(true);
  expect(await prisma().discoveryScan.findFirstOrThrow()).toMatchObject({ status: "CANCELLED", owner: null });
  expect(await prisma().discoveryPosting.findFirstOrThrow()).toMatchObject({ coverage: null });
  expect(await prisma().tailoringSelection.count()).toBe(0);
});

it("recollects failed sources and finishes when a later source succeeds despite a sibling failure", async () => {
  vi.mocked(collectDiscovery)
    .mockResolvedValueOnce({ postings: [], sources: [{ source: "YC", found: 0, error: "Unavailable" }] })
    .mockResolvedValueOnce({ postings: [posting], sources: [{ source: "YC", found: 0, error: "Unavailable" }, { source: "HN", found: 1, error: null }] });
  vi.mocked(analyzePosting).mockResolvedValue(result);
  await enqueueScan();
  await discoveryTick();
  const failed = await prisma().discoveryScan.findFirstOrThrow();
  expect(failed).toMatchObject({ status: "FAILED", checkpoint: null, sourceResults: [{ source: "YC", found: 0, error: "Unavailable" }] });
  await retryScan(failed.id);
  await discoveryTick();
  expect(collectDiscovery).toHaveBeenCalledTimes(2);
  expect(await prisma().discoveryScan.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({ status: "COMPLETED", kbSnapshotId: failed.kbSnapshotId });
  expect(await prisma().discoveryPosting.count()).toBe(1);
});

it("retries an unsuccessful analysis with the original snapshot and reuses successful coverage on later sightings", async () => {
  vi.mocked(resolveIntake).mockResolvedValue(posting);
  vi.mocked(analyzePosting).mockRejectedValueOnce(new Error("Fixture model unavailable")).mockResolvedValue(result);
  const intake = { url: "", jd: posting.jd, role: posting.role, company: posting.company };
  await enqueueScan(intake);
  await discoveryTick();
  const failed = await prisma().discoveryScan.findFirstOrThrow();
  expect(failed.status).toBe("FAILED");
  expect(await prisma().discoveryPosting.findFirstOrThrow()).toMatchObject({ sightings: 1, coverage: null, analysisError: expect.any(String) });
  await prisma().skill.create({ data: { name: "SQL" } });
  await retryScan(failed.id);
  await discoveryTick();
  expect(resolveIntake).toHaveBeenCalledTimes(1);
  expect(vi.mocked(analyzePosting).mock.calls[1][1]).toEqual(vi.mocked(analyzePosting).mock.calls[0][1]);
  expect(await prisma().discoveryPosting.findFirstOrThrow()).toMatchObject({ sightings: 1, coverage: { score: 0 }, kbSnapshotId: failed.kbSnapshotId, analysisError: null });
  await enqueueScan(intake);
  await discoveryTick();
  expect(analyzePosting).toHaveBeenCalledTimes(3);
  await enqueueScan(intake);
  await discoveryTick();
  expect(analyzePosting).toHaveBeenCalledTimes(3);
  expect(await prisma().discoveryPosting.findFirstOrThrow()).toMatchObject({ sightings: 3 });
  expect(await prisma().application.count()).toBe(0);
  expect(await prisma().document.count()).toBe(0);
  expect(await prisma().tailoringSelection.count()).toBe(0);
});

it("reapplies tightened preferences to cached findings without another model call", async () => {
  vi.mocked(collectDiscovery).mockResolvedValue({postings:[{...posting, role:"Senior Software Engineer"}],sources:[{source:"WEB",found:1,error:null}]});
  vi.mocked(analyzePosting).mockResolvedValue({...result,extracted:{...result.extracted,role:"Senior Software Engineer"}});
  await enqueueScan(); await discoveryTick();
  expect((await prisma().discoveryPosting.findFirstOrThrow()).state).toBe("NEW");
  await prisma().setting.create({data:{key:"workflow.discovery",value:JSON.stringify({roles:[],locations:[],workArrangements:[],excludedCompanies:[],minimumSalary:null,salaryCurrency:"USD",constraints:"",experienceLevel:"early-career"})}});
  await enqueueScan(); await discoveryTick();
  expect(analyzePosting).toHaveBeenCalledTimes(1);
  expect((await prisma().discoveryPosting.findFirstOrThrow()).state).toBe("DISMISSED");
});
