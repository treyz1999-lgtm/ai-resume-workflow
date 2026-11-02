import { createHash } from "node:crypto";
import { route } from "@/lib/route";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const POST = route(async request => {
  const name = (request.headers.get("x-file-name") ?? "resume.pdf").slice(0, 500);
  if (request.headers.get("content-type") !== "application/pdf") return Response.json({ error: "Upload a PDF resume." }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing PDF." }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 10 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "PDF must be at most 10 MB." }, { status: 413 }); }
    chunks.push(value);
  }
  const data = Buffer.concat(chunks);
  if (data.subarray(0, 5).toString() !== "%PDF-") return Response.json({ error: "Invalid PDF." }, { status: 400 });
  let preview: Buffer;
  try {
    const response = await fetch(`${process.env.WORKER_URL ?? "http://worker:4310"}/library/preview`, {
      method: "POST", headers: { "Content-Type": "application/pdf", "X-Worker-Token": env.DOSSIER_SECRET },
      body: data, signal: AbortSignal.timeout(40_000), redirect: "error",
    });
    if (!response.ok) throw new Error("preview");
    const imageReader = response.body?.getReader(); if (!imageReader) throw new Error("preview");
    const imageChunks: Uint8Array[] = []; let imageSize = 0;
    while (true) {
      const { done, value } = await imageReader.read(); if (done) break;
      imageSize += value.byteLength;
      if (imageSize > 8 * 1024 * 1024) { await imageReader.cancel(); throw new Error("preview"); }
      imageChunks.push(value);
    }
    preview = Buffer.concat(imageChunks);
    if (preview.length > 8 * 1024 * 1024 || !preview.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("preview");
  } catch { return Response.json({ error: "This PDF could not be previewed. Check the worker, or try an unencrypted PDF." }, { status: 503 }); }
  const asset = await prisma.resumeAsset.create({ data: { name, mimeType: "application/pdf", size, sha256: createHash("sha256").update(data).digest("hex"), data: new Uint8Array(data), preview: new Uint8Array(preview) }, select: { id: true } });
  return Response.json(asset, { status: 201 });
});
