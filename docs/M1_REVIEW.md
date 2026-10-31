# M1 review record — in progress

Updated October 31, 2026. M0 is approved and published; M1 remains local on `milestone/m1`. Do not push M1 or begin M2 until the milestone is demonstrated and the user approves.

## Implemented

- Settings → Connections: Codex ChatGPT device sign-in/cancel/sign-out, connection refresh, model selection, usage windows, structured fictional test runs, cancellation/resume, and progress output.
- Internal authenticated worker with PostgreSQL claims, leases, durable checkpoints, restart recovery, and one active diagnostic run. Authentication and quota failures preserve a resumable record without API fallback.
- Codex app-server adapter pinned to CLI 0.165.0; API-compatible and Ollama transports have deterministic fixtures. Existing hosted/local-provider settings remain available.
- Docker worker bundles pdfLaTeX, Poppler, and Chromium. Fixed fictional LaTeX sample compiles locally with shell escape disabled and exposes PDF/source downloads and a preview.
- Separate credential/work volumes. Worker and database have no published host ports; the application binds localhost. Codex child environment excludes application/database/API secrets.

## Verification

- Production Docker app/worker build and healthy application startup verified.
- Live browser: Connections loads, refreshes the disconnected state, compiles the fictional sample, reports one page with readable PDF text, and displays PDF/source links and the PDF frame.
- 80 Playwright checks passed, including page accessibility in light/dark layouts, keyboard interactions, and the mocked device-code/structured-result flow.
- Full lint/type/test/coverage results: final rerun pending. The earlier full run found a static route-wrapper audit failure; exports now directly use the standard session/origin wrapper. Coverage collection was restricted to code extensions because the broad upstream glob attempted to parse the font README; thresholds are unchanged.
- Independent reviews found and resolved shutdown-during-claim and late-cancellation stage inconsistencies. Regressions cover both, durable checkpoint ordering, malformed Codex events, stale leases, competing claims, cancellation, quota/auth blocks, and logout with more than thirty queued records.

## Required live gate and limitations

The user must complete ChatGPT sign-in through Settings → Connections, then a real diagnostic must finish with a verified structured response. This has **not yet been verified**. A model catalog or successful unsigned-in app-server handshake does not establish subscription execution. API-compatible and Ollama transports are fixture-verified, not proof of a locally installed model's capabilities.

M1 is an execution/toolchain diagnostic, not V5 tailoring. Profile/KB/template registration begins in M2; discovery and the full tailoring queue arrive in later milestones. The sample tests package compatibility, not every future resume's layout. Full V5 source masters remain untouched.

## Local review

Run `docker compose -f compose.production.yml up -d --build`, then open `http://localhost:3000/settings?section=connections`. Existing local data and credential volumes persist. For development use `localhost` rather than `127.0.0.1`: the installed Next development server rejects the latter's HMR origin by default. Production does not depend on HMR.

Inspect `git diff origin/main...HEAD` plus `git diff` for the complete local milestone. Ignored evidence logs and sample artifacts live under `runtime/m1/`; credentials and private records must never be added to the review commit.
