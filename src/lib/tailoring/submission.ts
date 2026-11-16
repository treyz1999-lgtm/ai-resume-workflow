import "server-only";
import { z } from "zod";
import { ActionError } from "@/lib/action";
import { prisma } from "@/lib/prisma";
import { scanLock } from "@/lib/discovery/store";

const passingReview = z.object({
  verified: z.literal(true),
  problems: z.array(z.string()).length(0),
  score: z.number().int().min(0).max(100),
  report: z.object({ method: z.string().min(1) }),
});
const metadata = z.object({
  location: z.string().nullish(),
  salaryOriginal: z.string().nullish(),
  arrangement: z.string().nullish(),
});
const frozenPosting = z.object({ company: z.string(), role: z.string(), jd: z.string() });

export async function markTailoringSubmitted(
  selectionId: string, resumeRevisionId: string, letterRevisionId: string | null, date: string,
) {
  const submittedAt = new Date(z.iso.date().parse(date) + "T00:00:00Z");
  return prisma.$transaction(async tx => {
    await scanLock(tx);
    await tx.$queryRaw`SELECT id FROM "TailoringSelection" WHERE id = ${selectionId} FOR UPDATE`;
    const run = await tx.tailoringSelection.findUniqueOrThrow({
      where: { id: selectionId }, include: { posting: true, submission: true },
    });
    const existing = run.submission;
    if (existing) {
      if (existing.resumeRevisionId === resumeRevisionId && existing.letterRevisionId === letterRevisionId &&
        existing.submittedAt.getTime() === submittedAt.getTime()) return existing.applicationId;
      throw new ActionError("This attempt already has a recorded submission.");
    }
    if (run.status !== "PENDING") throw new ActionError("Finish verification before recording a submission.");
    const revisions = await tx.tailoringRevision.findMany({
      where: { runId: selectionId, id: { in: letterRevisionId ? [resumeRevisionId, letterRevisionId] : [resumeRevisionId] } },
      select: { id: true, kind: true, generation: true, matchReport: true },
    });
    const resume = revisions.find(revision => revision.id === resumeRevisionId && revision.kind === "resume");
    const review = passingReview.safeParse(resume?.matchReport);
    if (!resume || !review.success) throw new ActionError("Select a verified resume from this attempt.");
    if (letterRevisionId && !revisions.some(revision => revision.id === letterRevisionId &&
      revision.kind === "letter" && revision.generation === resume.generation && passingReview.safeParse(revision.matchReport).success)) {
      throw new ActionError("Select a verified letter from the same preparation as the resume.");
    }
    const posting = frozenPosting.parse(run.frozen);
    const fields = metadata.parse(run.posting.extracted ?? {});
    const application = await tx.application.create({ data: {
      company: posting.company, role: posting.role, title: posting.role, postingText: posting.jd,
      postingUrl: run.posting.url, location: fields.location ?? "", salary: fields.salaryOriginal ?? "",
      mode: fields.arrangement ?? "", status: "SENT", furthestStage: "SENT", sentAt: submittedAt,
      events: { create: { from: "DRAFT", to: "SENT", at: submittedAt } },
      submission: { create: {
        runId: selectionId, resumeRevisionId, letterRevisionId, submittedAt,
        score: review.data.score, scoringMethod: review.data.report.method,
      } },
    } });
    await tx.tailoringSelection.update({ where: { id: selectionId }, data: { status: "SUBMITTED", stage: "Submitted" } });
    return application.id;
  });
}
