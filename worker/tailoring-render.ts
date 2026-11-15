import type { IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { letterRenderSchema, printSnapshotSchema, resumeRenderSchema } from "../src/lib/tailoring/render-input";
import { renderV5Resume, renderCoverLetter, type V5Contact } from "../src/lib/templates/v5";

const exec = promisify(execFile);
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
export const REGISTERED_MASTER = "b53cce3bb6f536e49d1192169a05d193d051eaa2b5b366b8ad22c090bdedaf8f";
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resume"), track: z.enum(["swe","data"]), resume: resumeRenderSchema }).strict(),
  z.object({ kind: z.literal("letter"), letter: letterRenderSchema }).strict(),
  z.object({ kind: z.literal("theme"), snapshot: printSnapshotSchema, pdf: z.string().min(16).max(12_000_000) }).strict(),
]);
export type RenderRequest = z.infer<typeof requestSchema>;
export class RenderFailure extends Error {}
const fail = (reason: string): never => { throw new RenderFailure(reason); };
const canon = (text: string) => text.normalize("NFKC").replace(/[\u00ad\s]/g, "").toLowerCase();

function required(input: RenderRequest) {
  const c: V5Contact = input.kind === "letter" ? input.letter.contact : input.kind === "theme" ? input.snapshot.resume.contact : input.resume.contact;
  const text = [c.name, c.location, c.phone, c.email].filter((v): v is string => Boolean(v));
  const links = [c.linkedin, c.github, c.website, c.email ? "mailto:" + c.email : null].filter((v): v is string => Boolean(v));
  if (input.kind === "letter") {
    const l = input.letter;
    text.push(l.date, l.company, l.role, l.salutation, ...l.paragraphs, l.closing);
  } else {
    const { resume, track } = input.kind === "theme" ? input.snapshot : input;
    for (const s of resume.skills) text.push(s.category, ...s.items);
    for (const r of resume.experience.filter(r => track === "swe" ? r.includeSwe : r.includeData)) text.push(r.role, r.company, r.location, r.dates, ...r.bullets);
    for (const p of resume.projects) { text.push(p.name, ...p.stack, ...p.bullets); links.push(p.url); }
    for (const e of resume.education) text.push(e.school, e.degree, e.dates, e.location ?? "", ...e.details ?? []);
  }
  return { text: text.filter(Boolean), links };
}

export async function renderAndInspect(raw: unknown, signal: AbortSignal) {
  const input = requestSchema.parse(raw);
  const scratch = await mkdtemp(join(tmpdir(), "v5-build-"));
  const tool = async (name: string, args: string[]) => {
    try {
      const result = await exec(name, args, { cwd: scratch, timeout: 40_000, maxBuffer: 4_000_000, signal,
        encoding: "utf8", env: { NODE_ENV: "production", PATH: process.env.PATH, HOME: scratch, LANG: "C.UTF-8", openin_any: "p", openout_any: "p" } });
      return result.stdout;
    } catch { return fail(signal.aborted ? "Rendering cancelled." : "Local document tool failed: " + name + ". Check the installation and compiler inputs."); }
  };
  try {
    const registered = hash((await readFile(join(process.cwd(), "src/lib/templates/v5.ts"), "utf8")).replace(/\r\n/g, "\n"));
    if (registered !== REGISTERED_MASTER) fail("The registered V5 master failed its integrity check.");
    let source: string;
    if (input.kind === "theme") {
      source = JSON.stringify(input.snapshot, null, 2);
      const pdf = Buffer.from(input.pdf, "base64");
      if (pdf.subarray(0, 5).toString() !== "%PDF-") fail("The HTML renderer returned an invalid PDF.");
      await writeFile(join(scratch, "document.pdf"), pdf);
    } else {
      source = input.kind === "letter" ? renderCoverLetter(input.letter) : renderV5Resume(input.track, input.resume);
      await writeFile(join(scratch, "document.tex"), source, { mode: 0o600 });
      await tool("pdflatex", ["-no-shell-escape", "-halt-on-error", "-interaction=nonstopmode", "document.tex"]);
      const log = await readFile(join(scratch, "document.log"), "utf8");
      if (/Overfull \\[hv]box \(([\d.]+)pt/g.test(log)) fail("The LaTeX document overflows its layout. Shorten the content before retrying.");
      if (/Missing character:/.test(log)) fail("The selected font cannot render part of this document.");
    }
    const info = await tool("pdfinfo", ["document.pdf"]);
    if (!/^Pages:\s*1\s*$/m.test(info)) fail("The rendered document must fit one page.");
    const text = (await tool("pdftotext", ["-raw", "document.pdf", "-"])).trim();
    const extracted = canon(text);
    const inventory = required(input);
    if (!extracted || inventory.text.some(fragment => !extracted.includes(canon(fragment)))) fail("The PDF text is missing protected fields or document content.");
    const urls = await tool("pdfinfo", ["-url", "document.pdf"]);
    const target = (s: string) => { try { return new URL(s).href.replace(/%[0-9a-f]{2}/gi, m => m.toUpperCase()); } catch { return ""; } };
    const actual = new Set([...urls.matchAll(/^\s*\d+\s+Annotation\s+(\S+)/gm)].map(m => target(m[1])));
    if (inventory.links.some(url => !actual.has(target(url)))) fail("A required hyperlink is missing or incorrect in the PDF.");
    const bbox = await tool("pdftotext", ["-bbox", "document.pdf", "-"]);
    const page = /<page width="([\d.]+)" height="([\d.]+)">/.exec(bbox);
    const words = [...bbox.matchAll(/<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">/g)];
    if (!page || !words.length || words.some(w => +w[1] < 1 || +w[2] < 1 || +w[3] > Number(page[1]) - 1 || +w[4] > Number(page[2]) - 1)) fail("Document text extends outside the printable page.");
    await tool("pdftoppm", ["-singlefile", "-scale-to", "1320", "-png", "document.pdf", "preview"]);
    const [pdf, preview] = await Promise.all([readFile(join(scratch, "document.pdf")), readFile(join(scratch, "preview.png"))]);
    if (!preview.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || pdf.length + preview.length > 9_000_000) fail("Document artifact verification failed.");
    return { kind: input.kind === "letter" ? "letter" : "resume", format: input.kind === "theme" ? "html" : "latex", source,
      pdf: pdf.toString("base64"), preview: preview.toString("base64"), text,
      verification: { version: 1, pages: 1, checkedTextFragments: inventory.text.length, checkedLinks: inventory.links,
        registeredMasterSha256: registered, sourceSha256: hash(source), pdfSha256: hash(pdf), previewSha256: hash(preview), layout: "one page; all words inside page bounds" } };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

export async function handleTailoringRender(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (request.method !== "POST" || request.url !== "/tailoring/render") return false;
  const controller = new AbortController();
  const close = () => { if (!response.writableEnded) controller.abort(); };
  response.on("close", close);
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  try {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const part of request) {
      const chunk = Buffer.from(part); bytes += chunk.length;
      if (bytes > 14_000_000) fail("Rendering input exceeds the supported size.");
      chunks.push(chunk);
    }
    const result = await renderAndInspect(JSON.parse(Buffer.concat(chunks).toString("utf8")), controller.signal);
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 422;
    response.end(JSON.stringify({ error: error instanceof RenderFailure ? error.message : "Invalid document input or incomplete render." }));
  } finally { response.off("close", close); }
  return true;
}

