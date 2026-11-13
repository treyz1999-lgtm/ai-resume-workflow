import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RenderedDocument, TailoredContent } from "./contracts";
import { printFrozenResume } from "./print-snapshot";
import { printSnapshotSchema } from "./render-input";

const resultSchema = z.object({
  kind: z.enum(["resume", "letter"]), format: z.enum(["latex", "html"]), source: z.string().min(1),
  pdf: z.string().min(1), preview: z.string().min(1), text: z.string().min(1), verification: z.record(z.string(), z.unknown()),
});
async function checkedRender(input: unknown, signal: AbortSignal): Promise<RenderedDocument> {
  const token = process.env.DOSSIER_SECRET;
  if (!token) throw new Error("Document worker credentials are missing.");
  const response = await fetch((process.env.WORKER_URL ?? "http://worker:4310").replace(/\/$/, "") + "/tailoring/render", {
    method: "POST", headers: { "content-type": "application/json", "x-worker-token": token },
    body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(150_000)]), redirect: "error",
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The document worker returned an empty response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > 14_000_000) { await reader.cancel(); throw new Error("The document response exceeded its size limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!response.ok) throw new Error(typeof body.error === "string" && body.error.length < 300 ? body.error : "Document verification failed.");
  const data = resultSchema.parse(body);
  const pdf = Buffer.from(data.pdf, "base64"), preview = Buffer.from(data.preview, "base64");
  const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  if (data.verification.pages !== 1 || digest(pdf) !== data.verification.pdfSha256 || digest(preview) !== data.verification.previewSha256 || digest(data.source) !== data.verification.sourceSha256) {
    throw new Error("Document bytes do not match the verified revision.");
  }
  return { ...data, pdf, preview };
}

export async function renderTailoring(content: TailoredContent, theme: Record<string, unknown> | null, signal: AbortSignal): Promise<RenderedDocument[]> {
  signal.throwIfAborted();
  const { track, resume, letter } = content;
  const snapshot = theme ? printSnapshotSchema.parse({ version: 1, track, resume, theme }) : null;
  const request = snapshot
    ? { kind: "theme", snapshot, pdf: Buffer.from(await printFrozenResume(snapshot)).toString("base64") }
    : { kind: "resume", track, resume };
  const documents = [await checkedRender(request, signal)];
  if (letter) documents.push(await checkedRender({ kind: "letter", letter }, signal));
  return documents;
}

