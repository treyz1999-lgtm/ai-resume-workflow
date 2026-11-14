import { prisma } from "@/lib/prisma";
import { route } from "@/lib/route";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const file = request.nextUrl.searchParams.get("file") ?? "pdf";
  const where = { id, run: { status: "PENDING" }, matchReport: { path: ["verified"], equals: true } };
  const missing = () => new Response(null, { status: 404 });
  function download(body: BodyInit, mime: string, name: string) {
    return new Response(body, { headers: {
      "Content-Type": mime, "Content-Disposition": 'attachment; filename="' + name + '"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  }
  // Each query enforces readiness and reads just the requested artifact.
  const db = prisma.tailoringRevision;
  if (file === "pdf" || file === "preview") {
    const revision = await db.findFirst({ where, select: { kind: true, pdf: file === "pdf", preview: file === "preview" } });
    if (!revision) return missing();
    const name = revision.kind === "letter" ? "cover-letter" : "resume";
    return file === "pdf"
      ? download(new Uint8Array(revision.pdf), "application/pdf", name + ".pdf")
      : download(new Uint8Array(revision.preview), "image/png", name + ".png");
  }
  if (file === "source") {
    const revision = await db.findFirst({ where, select: { kind: true, format: true, source: true } });
    if (!revision) return missing();
    const name = revision.kind === "letter" ? "cover-letter" : "resume";
    return revision.format === "latex"
      ? download(revision.source, "text/plain; charset=utf-8", name + ".tex")
      : download(revision.source, "application/json; charset=utf-8", name + ".json");
  }
  if (file === "report" || file === "verification") {
    const revision = await db.findFirst({ where, select: { matchReport: file === "report", evidence: file === "report", verification: file === "verification" } });
    if (!revision) return missing();
    const payload = file === "report" ? { report: revision.matchReport, evidence: revision.evidence } : revision.verification;
    return download(JSON.stringify(payload, null, 2), "application/json; charset=utf-8", file + ".json");
  }
  return missing();
});
