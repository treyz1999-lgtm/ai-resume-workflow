import "server-only";
import { prisma } from "@/lib/prisma";
import { FUNNEL_STAGES } from "@/lib/status";
import { columns, encodeTracker, parseTracker, type CsvFields } from "./format";

type Attempt = ReturnType<typeof parseTracker>[number];
export async function previewAttempts(attempts: Attempt[]) {
  const existing = await prisma.application.findMany({where: {id: {in: attempts.map(a => a.id)}}, select: {id:true}});
  const ids = new Set(existing.map(a => a.id));
  return attempts.map(a => ({id:a.id, company:a.company, role:a.role, date:a.fields.date_applied ?? "", status:a.status, exists:ids.has(a.id)}));
}

export async function importAttempts(attempts: Attempt[]) {
  // One statement, one unique ID per attempt. Retrying a confirmed upload is safe.
  return prisma.application.createMany({skipDuplicates:true, data:attempts.map(({id,company,role,fields,status,applied}) => ({
    id, company, role, title:role, status, trackerCsv:{...fields,local_status:status},
    location:fields.state ?? "", mode:fields.work_arrangement ?? "",
    salary:fields.salary || [fields.salary_min,fields.salary_max].filter(Boolean).join(" – "),
    postingUrl:fields.posting_url ?? "",
    createdAt:applied ?? undefined,
    sentAt:status === "DRAFT" ? null : applied,
    furthestStage:FUNNEL_STAGES.find(s => s === status) ?? (status === "REJECTED" || (status === "DECLINED" && applied) ? "SENT" : null),
  }))});
}

export async function exportAttempts() {
  const apps = await prisma.application.findMany({
    where:{awaitingReview:false}, orderBy:[{createdAt:"asc"},{id:"asc"}],
    select:{id:true,company:true,role:true,location:true,mode:true,salary:true,postingUrl:true,status:true,sentAt:true,
      trackerCsv:true, submission:{select:{score:true,scoringMethod:true,submittedAt:true}}},
  });
  return encodeTracker(apps.map(app => {
    const stored: CsvFields = {};
    if (app.trackerCsv && typeof app.trackerCsv === "object" && !Array.isArray(app.trackerCsv)) {
      for (const col of columns) {
        const value = app.trackerCsv[col];
        if (typeof value === "string") stored[col] = value;
      }
    }
    return {...stored, application_id:stored.application_id || app.id, local_id:app.id, company:app.company, job_title:app.role,
      state:app.location, work_arrangement:app.mode, salary:app.salary, posting_url:app.postingUrl,
      local_status:app.status, application_status:stored.application_status && stored.local_status === app.status ? stored.application_status : app.status,
      date_applied:(app.submission?.submittedAt ?? app.sentAt)?.toISOString().slice(0,10) ?? stored.date_applied,
      submitted_score:app.submission?.score.toString() ?? stored.submitted_score, scoring_method:app.submission?.scoringMethod ?? stored.scoring_method};
  }));
}

