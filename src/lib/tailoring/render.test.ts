import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { BUILT_IN_THEMES } from "../themes";
import { fictionalResume, fictionalCoverLetter } from "../templates/v5";
import { printFrozenResume } from "./print-snapshot";
import { renderTailoring } from "./render";
vi.mock("./print-snapshot", () => ({ printFrozenResume: vi.fn(async () => Buffer.from("%PDF-themed")) }));
const input = { track: "swe" as const, resume: fictionalResume, letter: null, evidence: [] };
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
function response(kind = "resume", format = "latex") {
  return { kind, format, source: "source", pdf: Buffer.from("pdf").toString("base64"), preview: Buffer.from("png").toString("base64"), text: "Morgan Example",
    verification: { pages: 1, pdfSha256: digest("pdf"), previewSha256: digest("png"), sourceSha256: digest("source") } };
}
const go = (content: Parameters<typeof renderTailoring>[0] = input, theme: Record<string, unknown> | null = null) => renderTailoring(content, theme, new AbortController().signal);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("verified revision transport", () => {
  it("submits only structured LaTeX inputs to the fixed internal worker, including an opted-in letter", async () => {
    vi.stubEnv("DOSSIER_SECRET", "test-render-only");
    vi.stubEnv("WORKER_URL", "http://fixture:4310/");
    const send = vi.fn(async (_url: string, init: RequestInit) => Response.json(response(JSON.parse(String(init.body)).kind)));
    vi.stubGlobal("fetch", send);
    const docs = await go({ ...input, letter: fictionalCoverLetter });
    expect(docs.map(d => d.kind)).toEqual(["resume", "letter"]);
    for (const [url, init] of send.mock.calls) {
      expect(url).toBe("http://fixture:4310/tailoring/render");
      expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "x-worker-token": "test-render-only" } });
      expect(JSON.parse(String(init.body))).not.toHaveProperty("source");
    }
    expect(printFrozenResume).not.toHaveBeenCalled();
  });
  it("renders the frozen theme and persists byte-identical inspected output", async () => {
    vi.stubEnv("DOSSIER_SECRET", "test-render-only");
    const fetcher = vi.fn(async () => Response.json(response("resume", "html")));
    vi.stubGlobal("fetch", fetcher);
    const [doc] = await go(input, BUILT_IN_THEMES[0]);
    expect(printFrozenResume).toHaveBeenCalledWith(expect.objectContaining({ theme: BUILT_IN_THEMES[0], resume: input.resume }));
    expect(Buffer.from(doc.pdf).toString()).toBe("pdf");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects unverified bytes, unavailable tools and absent response bodies", async () => {
    vi.stubEnv("DOSSIER_SECRET", "test-render-only");
    const send = vi.fn().mockResolvedValueOnce(Response.json({ ...response(), source: "tampered" }))
      .mockResolvedValueOnce(Response.json({ error: "Compiler unavailable." }, {status: 422})).mockResolvedValueOnce(new Response(null));
    vi.stubGlobal("fetch", send);
    await expect(go()).rejects.toThrow("verified revision");
    await expect(go()).rejects.toThrow("Compiler unavailable.");
    await expect(go()).rejects.toThrow("empty response");
  });
  it("checks worker credentials and respects cancellation before starting document tools", async () => {
    const send = vi.fn(); vi.stubGlobal("fetch", send); vi.stubEnv("DOSSIER_SECRET", "");
    await expect(go()).rejects.toThrow("credentials");
    await expect(renderTailoring(input, null, AbortSignal.abort())).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

