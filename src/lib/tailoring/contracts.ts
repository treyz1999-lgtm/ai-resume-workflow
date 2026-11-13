import type { V5Track, V5ResumeInput, CoverLetterInput } from "../templates/v5";

/** All reads after the run starts use these frozen inputs. The theme itself is
 * resolved by the coordinator only after the five-project plan is persisted. */
export type FrozenInput = {
  kb: unknown; jd: string; company: string; role: string; preparedAt: string;
  options: { track: "auto" | V5Track; themeId: string | null; coverLetter: boolean };
  provider: "codex" | "configured"; model: string;
};
export type SelectionPlan = { reviewed: { id: string; reason: string }[]; selected: string[]; rationale: string };
export type TailoredContent = {
  compositionReason?: string;
  track: V5Track; resume: V5ResumeInput; letter: CoverLetterInput | null;
  evidence: { text: string; quote: string; sourceId: string }[];
};
export type RenderedDocument = {
  kind: "resume" | "letter"; format: "latex" | "html"; source: string;
  pdf: Uint8Array; preview: Uint8Array; text: string; verification: Record<string, unknown>;
};
export type ReviewResult = { verified: boolean; problems: string[]; score: number | null; report: Record<string, unknown> };
export type QueueStatus = "QUEUED" | "RUNNING" | "FAILED" | "CANCELLED" | "PENDING";
export type QueueView = { paused: boolean; rows: {
  id: string; role: string; company: string; status: QueueStatus; stage: string; error: string | null;
  position: number; score: number | null; documents: { id: string; kind: string; format: string }[];
}[] };
