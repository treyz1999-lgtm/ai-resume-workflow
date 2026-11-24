# Discovery analysis correction

November 24, 2026 — approved for commit and push on November 24, 2026.

The worker collapsed evidence-validation failures into a generic invalid-result error. A retained real analysis was valid structured JSON but contained a supporting quotation that was not present in the KB. This prevented scoring; the UI did not explain the actual cause.

The worker now allows one correction pass with the same complete JD and KB, the rejected response and validation feedback. It never silently accepts invalid evidence. Requirements with verified JD quotes must retain their requirement text and quote during correction, preventing an inflated score from dropping inconvenient requirements. Oversized correction contexts fail explicitly without clipping data. Quota, authentication and cancellation errors do not trigger correction. API/local provider analysis uses the same evidence-correction helper; provider-specific transport/format retries remain separate.

User-facing messages distinguish KB quote, JD quote, structured-format and other evidence failures. Failed manual analyses can be retried while board discovery remains paused. The worker request timeout accommodates two bounded analysis turns.

Verification: 109 discovery unit, DOM and database tests passed; type checks and targeted lint passed before final build. Production app/worker builds passed. Independent review identified requirement-dropping and misleading context-limit reporting; both were corrected with regression coverage. Personal diagnostics stay outside Git under `private/`.

Live acceptance: retried the existing failed posting using its original saved KB/JD. The same posting now has a validated 65% evidence-alignment score and no analysis error. Broad discovery remains paused; no duplicate application or submission was created.
