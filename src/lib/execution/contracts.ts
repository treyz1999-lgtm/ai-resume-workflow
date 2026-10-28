/** Shared M1 contracts. Never include tokens or API keys in persisted task context. */
export type ExecutionStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "BLOCKED" | "INTERRUPTED" | "FAILED";
export type ExecutionProgress = { type: "stage" | "delta" | "checkpoint"; message?: string; threadId?: string; turnId?: string };
export type TaskContext = { id: string; prompt: string; model?: string; threadId?: string; outputSchema?: Record<string, unknown> };
export type ExecutionResult = { text: string; structured?: unknown; threadId?: string; turnId?: string };
export type ExecutionCapabilities = { structured: boolean; streaming: boolean; cancellation: boolean; resume: boolean };
export interface ExecutionAdapter {
  readonly capabilities: ExecutionCapabilities;
  execute(context: TaskContext, signal: AbortSignal, progress: (event: ExecutionProgress) => void): Promise<ExecutionResult>;
}
export type ConnectionView = {
  connected: boolean; authType: string | null; plan: string | null;
  models: { id: string; name: string; isDefault?: boolean }[];
  limits: { name: string; usedPercent: number; windowMinutes: number; resetsAt: number | null }[];
  error?: string;
};
export type LoginView = { loginId: string; verificationUrl: string; userCode: string };
export type RunView = {
  id: string; status: ExecutionStatus; model: string | null; stage: string | null;
  output: string; result: unknown; error: string | null;
  createdAt: string; updatedAt: string;
};
export type LatexArtifact = { id: string; pages: number; text: string; pdfUrl: string; sourceUrl: string };
export const DIAGNOSTIC_SCHEMA = { type: "object", properties: { status: { type: "string", enum: ["ok"] }, message: { type: "string" } }, required: ["status", "message"], additionalProperties: false };
export const DIAGNOSTIC_PROMPT = 'This is a connection test using fictional data. Return JSON with status "ok" and a short message confirming receipt of the fictional project Aurora. Do not use tools or read files.';
