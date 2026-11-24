import "server-only";
import { ActionError } from "@/lib/action";
import { AiError } from "@/lib/ai/errors";
import { getAiProvider } from "@/lib/ai";
import { discoveryAnalysisSchema, type DiscoveryAnalysis, type DiscoveryConfig, type DiscoveryInput } from "./contracts";
import { discoveryPrompt, validateAnalysis, DISCOVERY_INSTRUCTIONS, analyzeWithCorrection, AnalysisValidationError, ANALYSIS_FAILURES } from "./analysis-task";

/** Explicit selection only: failed subscription execution never falls back to API billing. */
export async function analyzePosting(posting: DiscoveryInput, kb: unknown, config: DiscoveryConfig, signal: AbortSignal): Promise<DiscoveryAnalysis> {
  signal.throwIfAborted();
  try { discoveryPrompt(posting, kb); } catch { throw new ActionError("The complete KB and JD exceed the discovery transport limit. Nothing was omitted."); }
  let result: unknown;
  if (config.provider === "configured") {
    const provider = await getAiProvider();
    try { return await analyzeWithCorrection(posting, kb, prompt => provider.complete({ system: DISCOVERY_INSTRUCTIONS, messages: [{ role: "user", content: prompt }],
      schema: discoveryAnalysisSchema, schemaName: "discovery_analysis", maxTokens: 16000, signal }), signal); } catch (error) {
      if (error instanceof AnalysisValidationError) throw new ActionError(error.message);
      throw new ActionError(error instanceof AiError && error.kind === "too-long" ? "The complete KB and JD exceed this model context. Select a model with a larger context; nothing was omitted." : "The configured AI provider could not analyze the posting. Check its connection/model and retry.");
    }
  } else {
    const token = process.env.DOSSIER_SECRET;
    if (!token) throw new ActionError("The execution worker is not configured.");
    const response = await fetch(`${(process.env.WORKER_URL ?? "http://worker:4310").replace(/\/$/, "")}/discovery/analyze`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "x-worker-token": token },
      body: JSON.stringify({ posting, kb, model: config.model }), signal: AbortSignal.any([signal, AbortSignal.timeout(450_000)]),
    });
    // Bound responses even when a broken worker advertises no Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Discovery execution returned no result.");
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Discovery result exceeded its size limit."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) {
      const codes: Record<string, string> = { auth: "Sign in with ChatGPT in Connections before retrying discovery.", quota: "Codex usage limit reached. This posting is retained for retry.", cancelled: "Discovery analysis was cancelled.", "invalid-result": "The model returned an incomplete or invalid discovery analysis.", transport: "The execution worker disconnected or timed out. Retry discovery." };
      throw new ActionError((Object.hasOwn(ANALYSIS_FAILURES, data.code) ? ANALYSIS_FAILURES[data.code as keyof typeof ANALYSIS_FAILURES] : codes[data.code]) ?? "The execution worker could not analyze this posting. Check Connections and retry.");
    }
    result = data;
  }
  try { return validateAnalysis(result, posting, kb); } catch { throw new ActionError("Analysis failed source-evidence validation. Unsupported results were not accepted; retry the posting."); }
}
