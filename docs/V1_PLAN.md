# AI Resume Workflow — V1 build plan

Status: **M0 in progress; M1–M7 unstarted.** This document records approved scope, not completed functionality. Actual results belong in milestone review reports.

## Delivery contract

Build a local, single-user Docker application from AienTech/dossier at `3271c8b2900082e0caa1ed42765b71d28134c0c1`. Preserve upstream Git history, AGPL license, and attribution; preserve MIT attribution for imported LaTeX assets. The intended GitHub fork is `ai-resume-workflow` under the user's authenticated account. Personal KBs, resumes, credentials, emails, and application records remain outside Git. Tests and demos use fictional data.

Every milestone ends with working-feature review, local diff, actual tests, useful screenshots/sample artifacts, and limitations. Fix or explicitly report failed checks. **No push or next-milestone work until explicit approval.** Approval authorizes that milestone's push and continuation. The first approval additionally authorizes creating the remote fork and configuring `origin`. No deployments, application submissions, or external assistant connector are included.

## Architecture and ownership

Retain Next.js, React, TypeScript, Prisma, PostgreSQL, useful upstream components and tests. Use one coordinator plus at most three build agents in isolated worktrees with disjoint ownership; see [AGENT_OWNERSHIP.md](AGENT_OWNERSHIP.md). Only the coordinator changes shared schema/migrations, integrates, and pushes. Assign independent review before each gate.

Target Docker services: localhost web, internal PostgreSQL, and a worker with Codex, LaTeX, PDF inspection, and existing HTML rendering. Optional Ollama and host-local endpoints remain supported. The worker/toolchain arrives in M1; M0 establishes the upstream baseline.

Durable execution uses PostgreSQL state, atomic claims, stage checkpoints, and recoverable leases. Only one tailoring application, including revisions, runs at a time. Discovery has its own queue and never automatically enqueues tailoring.

Minimum shared contracts:

- Versioned complete KB snapshot assembled from Profile, Work History, Projects, architecture explanations, and approved facts.
- Posting occurrence with complete JD, source identifiers, posting/reposting evidence, extracted fields, and observation timestamps.
- Workflow run joining an application attempt to KB/JD snapshots, options, provider, stages, outputs, and verification.
- Document revision joining editable source, PDF, evidence mappings, scores, and verification state.
- Submission record freezing exact document revisions and score.
- Execution adapter with task context, structured results, progress, cancellation, errors, and capability reporting.

Codex uses app-server with ChatGPT authentication. API/local models use application-orchestrated tasks/tools. Do not exclude providers based on assumed quality; honestly report execution/context/verification limitations without silently dropping evidence or falling back to API billing.

## Milestone checklist

### M0 — Fork baseline and local development environment

Owners: coordinator and infrastructure, with temporary documentation/privacy ownership.

- [ ] Prepare checkout at the pinned commit; document scope, checklist, ownership, and provenance.
- [ ] Run Dossier locally and establish test/build baseline.
- [ ] Configure persistent data and ignored runtime directories.
- [ ] Disable upstream telemetry and upstream-specific update prompts.

Gate: app starts locally, failures are documented, private files stay outside Git, and diff/launch instructions are reviewable. After approval only: create fork, retain `upstream`, configure `origin`, push approved baseline.

### M1 — Codex subscription execution and Docker toolchain

Owners: workflow/infrastructure; product owns Connections UI.

- [ ] Codex sign-in/out, connection test, streamed progress, usage limits; auth stored separately from ordinary backups.
- [ ] Prove subscription execution inside Docker without silent API billing fallback.
- [ ] Bundle registered V5 master's compiler/PDF dependencies; retain hosted/local providers and endpoints.
- [ ] Structured adapter round trip for real Codex, API-compatible fixture, and local transport.
- [ ] Preserve interrupted/quota-blocked jobs for continuation.

Gate: application sign-in and real Codex task, fictional LaTeX compilation, preview/download; disconnect, cancellation, expired auth, and quota tests. Pause with evidence if subscription execution is blocked.

### M2 — Profile as KB and libraries

Owners: product/coordinator; infrastructure owns templates.

- [ ] Editable Profile, Work History, Projects; architecture Mermaid or image uploads and explanation.
- [ ] Complete versioned KB snapshots; discovery preferences with flexible titles and explicit constraints.
- [ ] Resume upload/preview/download/history as references; no automatic validated-KB updates from uploads.
- [ ] V5 SWE/Data presets from existing master/policies; preserve source masters and MIT attribution. Per-variant work-history inclusion is data-driven.
- [ ] Twelve upstream themes as overrides; Auto/SWE/Data, template override, cover-letter toggle.
- [ ] Basic LaTeX cover-letter template.

Gate: edits update KB without changing history; fictional SWE/Data compile; theme overrides and library previews work.

### M3 — Intake and scheduled discovery

Owners: workflow/product.

- [ ] Public provider searches, startup discovery, pasted URLs/JDs. Retain upstream sources; isolate failures and expose supported source credentials. Additional browser boards are later adapters.
- [ ] Extract company, role, track, location, arrangement, salary/currency/period, original experience wording/band, requisition, source, posting dates. Preserve unknown values and original text.
- [ ] Selected-day/time windows; 1–60 minute interval; 1/2/3-hour sessions. System/browser timezone default with override; ten-minute default; initially off.
- [ ] One scan at a time; skip missed ticks after downtime. Stop starting scans at session expiry.
- [ ] Distinguish sightings from repost occurrences; preserve relative-date evidence to prevent daily-label drift creating reposts.
- [ ] KB coverage score, strengths/gaps, saved/dismissed state, single/bulk tailoring selection; remove automatic drafts.

Gate: no automatic tailoring, expiry respected, unchanged sightings deduplicate while evidenced reposts reappear, and source failures remain isolated.

### M4 — Sequential V5 tailoring and verification

Owners: workflow/infrastructure; product owns queue/progress.

- [ ] Persistent FIFO queue with pause, remove, reorder, cancel, retry; latest full KB/JD frozen when run starts. Discovery findings are context only.
- [ ] Planner/editor/reviewer responsibilities; consider every project and freeze exactly five before template access. Fewer than five valid projects produces a preparation blocker.
- [ ] Configured SWE/Data composition, approved evidence, ownership/metric boundaries, project links, V5 writing rules.
- [ ] Isolated working copies, immutable masters/history; local LaTeX default, HTML only for explicit theme override.
- [ ] Verify current build, evidence, content, protected fields, project inventory, links, readable layout, and PDF text.
- [ ] PDF, editable source, match report, verification record; HTML retains editable structured content/theme snapshot. Optional cover letter also verified.
- [ ] Only verified outputs enter Pending submission.

Gate: SWE/Data/theme runs and cover-letter on/off; restart recovery, unsupported claims, overflow, links, duplicate projects, missing compiler inputs, queue removal, and one-active-application tests.

### M5 — Review, submissions, and analytics

Owners: product/workflow; coordinator owns schema changes.

- [ ] Actual PDF preview, evidence, rationale, reports, verification; retain chat refinement, edits, undo, version history.
- [ ] Revisions invalidate readiness until affected checks pass.
- [ ] Retain board/table/dashboard, notes, outcomes. Mark submitted with date and selected versions.
- [ ] Separate attempts for reapplications; retries stay in their attempt. Local tracker is authoritative; CSV import/export with preview/validation. Personal migration later.
- [ ] Analytics use submitted-resume scores, never discovery scores.

Scoring: V5 weighted evidence alignment uses core/must-have weight 2, preference weight 1; direct evidence 1, partial 0.5, absent 0. Discovery evaluates full KB; final score credits only supported evidence demonstrated in final PDF. Report keyword coverage separately; preserve scoring method/version.

Gate: submission freezes revision/score; later edits cannot rewrite history; distinct reapplications and consistent views.

### M6 — Gmail updates and optional Calendar

Owners: workflow/product; verification owns matching tests.

- [ ] Retain optional Gmail, inbox, drafting, explicit send; Check updates report modeled on application-status-report.
- [ ] Read full relevant messages/threads, exclude receipts/marketing, deduplicate, process chronologically.
- [ ] Confident matches update existing attempts; uncertain reapplications require review. Preserve email references/status history.
- [ ] Optional Calendar with proposed changes confirmed first; no automated submission or scheduled outbound mail.

Gate: fictional rejections/interviews/assessments/offers, ambiguous duplicate roles, older quoted updates. Live checks only through user's sign-in. Tests never send real mail or change real calendars.

### M7 — Backup recovery and release

Owners: infrastructure/product; coordinator owns final acceptance.

- [ ] Host-visible backups folder, manual backup, configurable every-N-preparations backup. Defaults: ten newly ready preparations, ten automatic backups retained, manual backups until deleted.
- [ ] Include KB/history/assets/templates/resumes/sources/reports/tracker/non-secret settings; exclude keys/tokens, document reconnection.
- [ ] Checksums and restore to fresh Docker volumes; retries do not inflate preparation/backup counts.
- [ ] Docker, Codex, models, sources, schedules, recovery/upgrades/troubleshooting docs.
- [ ] Fictional demo, screenshots, architecture, upstream-versus-fork contributions, measured acceptance.
- [ ] Versioned importer preserves Dossier export compatibility; regression/accessibility/clean install.

Gate: clean and restored installs reproduce expected data/documents; full demo and release diff. Push/tag V1 only after approval.

## Cross-milestone acceptance

Run upstream lint/type checks and relevant Vitest/database/Playwright tests; finish the complete supported suite. Use fake AI/search/mail services in CI and explicit live Codex/local checks. Test recovery at stage boundaries and retry idempotence for documents/attempts/backups. Verify template hashes and rendered fixtures visually. Keep credentials/personal data out of commits/logs/screenshots/fixtures. Enforce exact-five, composition, full-KB review, and output verification regardless of provider. Authentication is optional per integration; internal execution connections are distinct from excluded external assistant connectors. Preserve existing V5 sources/history throughout; defer personal migration until the app works.
