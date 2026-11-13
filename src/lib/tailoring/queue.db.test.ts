import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { createTestClient } from "@/test/db";
import { resetDatabase } from "@/test/db";
import { cancelRun, claimRun, LEASE_MS, loadQueue, moveRun, ownedWrite, pauseQueue, removeRun, retryRun } from "./queue";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => { const { createTestClient } = await import("@/test/db"); db.client = createTestClient(); return { prisma: db.client }; });
const prisma = () => db.client!;
beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());
async function select(key: string) {
  const posting = await prisma().discoveryPosting.create({ data: { identityKey: key, occurrenceKey: key, source: "TEXT", externalId: key, role: key, jd: "Original fixture JD", complete: true, postingEvidence: {} } });
  return prisma().tailoringSelection.create({ data: { postingId: posting.id } });
}
it("pauses and reorders FIFO, allows removal and serializes racing claims", async () => {
  const one = await select("one"), two = await select("two"), three = await select("three");
  await pauseQueue(true);
  expect(await claimRun()).toBeNull();
  await moveRun(two.id, -1);
  await removeRun(three.id);
  expect((await loadQueue()).rows.map(row => row.id)).toEqual([two.id, one.id]);
  await pauseQueue(false);
  const claimed = (await Promise.all([claimRun(), claimRun()])).filter(Boolean);
  expect(claimed.map(row => row!.id)).toEqual([two.id]);
  await expect(removeRun(two.id)).rejects.toThrow("no longer waiting");
  await cancelRun(two.id);
  await expect(ownedWrite(two.id, claimed[0]!.owner!, async () => true)).rejects.toThrow("cancelled");
});
it("recovers expired work with its original KB and JD and fences the prior owner", async () => {
  const row = await select("recovery");
  await prisma().project.create({ data: { name: "Original project" } });
  const first = (await claimRun())!;
  await prisma().discoveryPosting.update({ where: { id: row.postingId }, data: { jd: "Later text" } });
  await prisma().project.create({ data: { name: "Later project" } });
  const recovered = (await claimRun(new Date(Date.now() + LEASE_MS + 1000)))!;
  expect(recovered.id).toBe(row.id);
  expect(recovered.owner).not.toBe(first.owner);
  expect(recovered.kbSnapshotId).toBe(first.kbSnapshotId);
  expect(recovered.frozen).toEqual(first.frozen);
  await expect(ownedWrite(row.id, first.owner!, async () => true)).rejects.toThrow();
});
it("retries a cancelled waiting item under its original identity", async () => {
  const row = await select("retry");
  await cancelRun(row.id);
  expect(await claimRun()).toBeNull();
  await retryRun(row.id);
  expect((await claimRun())!.id).toBe(row.id);
  expect(await prisma().tailoringSelection.count()).toBe(1);
});
