import "server-only";
import { evidenceFromText } from "./date-evidence";
import { ActionError } from "@/lib/action";
import { fetchPosting } from "@/lib/posting-fetch";
import type { DiscoveryPreferences } from "@/lib/knowledge-contracts";
import { webSearchResultSchema } from "./web-search-task";
import type { DiscoveryConfig, DiscoveryInput, SourceResult } from "./contracts";

/** Candidate URLs are hints only. JD text always comes from the guarded public fetch. */
export async function collectWebDiscovery(config: DiscoveryConfig, preferences: DiscoveryPreferences, signal: AbortSignal): Promise<{ postings: DiscoveryInput[]; sources: SourceResult[] }> {
  if (config.provider !== "codex") throw new ActionError("V5 web search requires the Codex connection. API/local models can use JSearch, YC, Hacker News and pasted postings.");
  const token = process.env.DOSSIER_SECRET;
  if (!token) throw new ActionError("The execution worker is not configured.");
  const response = await fetch(`${(process.env.WORKER_URL ?? "http://worker:4310").replace(/\/$/, "")}/discovery/search`, {
    method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "x-worker-token": token },
    body: JSON.stringify({ preferences, model: config.model }), signal: AbortSignal.any([signal, AbortSignal.timeout(260_000)]),
  });
  const reader = response.body?.getReader();
  if (!reader) throw new ActionError("Web search returned no response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 128_000) { await reader.cancel(); throw new ActionError("Web search response exceeded its limit."); } chunks.push(value);
  } } finally { reader.releaseLock(); }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!response.ok) {
    const messages: Record<string, string> = { auth: "Sign in with ChatGPT in Connections before searching.", quota: "Codex usage limit reached. Resume discovery after your limit resets.", cancelled: "Web search cancelled." };
    throw new ActionError(messages[data.code] ?? "Codex web search failed. Check Connections and retry; no API fallback was used.");
  }
  const result = webSearchResultSchema.parse(data);
  const sources: SourceResult[] = result.boards.map(board => ({ source: `WEB · ${board.board}`, found: 0,
    error: board.status === "searched" ? null : `${board.status}: ${board.note}` }));
  const postings: DiscoveryInput[] = []; const seen = new Set<string>();
  for (const candidate of result.candidates) {
    signal.throwIfAborted();
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    const fetched = await fetchPosting(candidate.url);
    signal.throwIfAborted();
    if (!fetched.ok) { sources.push({ source: `WEB · ${candidate.board} · posting`, found: 0, error: fetched.error }); continue; }
    // Unstructured pages can be clipped, login pages or listings. Keep them out of tailoring.
    postings.push({ source: "WEB", externalId: fetched.url, url: fetched.url, company: "", role: "", jd: fetched.text,
      complete: fetched.source === "structured", postingEvidence: evidenceFromText(fetched.text) });
    sources.find(source => source.source === `WEB · ${candidate.board}`)!.found++;
  }
  return { postings, sources };
}
