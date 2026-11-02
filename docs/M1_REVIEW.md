# M1 review record — ready for user review

Updated November 2, 2026. M0 is approved and published; M1 remains local on `milestone/m1`. Do not push M1 or begin M2 until the milestone is demonstrated and the user approves.

## Implemented

- Settings → Connections: Codex ChatGPT device sign-in/cancel/sign-out, connection refresh, model selection, usage windows, structured fictional test runs, cancellation/resume, and progress output.
- Internal authenticated worker with PostgreSQL claims, leases, durable checkpoints, restart recovery, and one active diagnostic run. Authentication and quota failures preserve a resumable record without API fallback.
- Codex app-server adapter pinned to CLI 0.165.0; API-compatible and Ollama transports have deterministic fixtures. Existing hosted/local-provider settings remain available.
- Docker worker bundles pdfLaTeX, Poppler, and Chromium. Fixed fictional LaTeX sample compiles locally with shell escape disabled and exposes PDF/source downloads and a preview.
- Separate credential/work volumes. Worker and database have no published host ports; the application binds localhost. Codex child environment excludes application/database/API secrets.

## Verification

- Production Docker app/worker build and healthy application startup verified.
- Live browser: Connections loads, refreshes the disconnected state, compiles the fictional sample, reports one page with readable PDF text, and displays PDF/source links. The native PDF frame was blank in the in-app browser, so the preview now uses Poppler's raster of the actual PDF. The 1020×1320 image loaded successfully and was visually inspected. Screenshot: ignored `runtime/m1/pdf-preview.png`; sample PDF and PNG are in the same directory.
- 80 Playwright checks passed, including page accessibility in light/dark layouts, keyboard interactions, and the mocked device-code/structured-result flow.
- Lint and typecheck passed. Full suite: 1,697 passed, 26 live checks skipped. Coverage passed unchanged thresholds: statements 86.59%, branches 80.13%, functions 84.79%, lines 88.63%. The earlier full run found a static route-wrapper audit failure; exports now directly use the standard session/origin wrapper. Coverage collection was restricted to code extensions because the broad upstream glob attempted to parse the font README; thresholds are unchanged.
- Independent reviews found and resolved shutdown-during-claim and late-cancellation stage inconsistencies. Regressions cover both, durable checkpoint ordering, malformed Codex events, stale leases, competing claims, cancellation, quota/auth blocks, and logout with more than thirty queued records.
- After the preview change: production Docker rebuild, lint, typecheck, and all 20 focused LaTeX/proxy/Connections tests passed. This includes rejection of an invalid generated preview.

## Live acceptance and limitations

On November 2, after the user completed OpenAI's device authorization, Connections displayed Connected and the real `gpt-6.1-sol` diagnostic completed with `{"status":"ok","message":"Received the fictional project Aurora."}`. The application verified its structured response. This ran through ChatGPT-authenticated Codex in Docker, with no API fallback. A subsequent worker restart preserved both authentication and the completed run. Ignored screenshot: `runtime/m1/codex-live-success.png`.

Cancellation, disconnect, expired-authentication, and quota behavior were verified with deterministic fixtures; this review did not deliberately exhaust the user's allowance or revoke their fresh sign-in. API-compatible and Ollama transports are fixture-verified, not proof of a locally installed model's capabilities. Credentials remain outside Git and ordinary backups. No additional live model runs are needed for this gate.

M1 is an execution/toolchain diagnostic, not V5 tailoring. Profile/KB/template registration begins in M2; discovery and the full tailoring queue arrive in later milestones. The sample tests package compatibility, not every future resume's layout. Full V5 source masters remain untouched.

## Local review

Run `docker compose -f compose.production.yml up -d --build`, then open `http://localhost:3000/settings?section=connections`. Existing local data and credential volumes persist. For development use `localhost` rather than `127.0.0.1`: the installed Next development server rejects the latter's HMR origin by default. Production does not depend on HMR.

Inspect `git diff origin/main...HEAD` plus `git diff` for the complete local milestone. Ignored evidence logs and sample artifacts live under `runtime/m1/`; credentials and private records must never be added to the review commit.
