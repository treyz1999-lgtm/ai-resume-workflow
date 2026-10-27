# AI Resume Workflow contributor instructions

## Scope and milestone gates

Implement the approved [V1 plan](docs/V1_PLAN.md). Current milestone: **M0, in progress**. M1-M7 are unstarted. Do not claim a planned feature works before implementing and verifying it.

Every milestone ends with a review pause. Present the working feature, local diff, actual check results, useful screenshots/artifacts, and limitations. **Do not push, create the GitHub fork, or start the next milestone until the user approves.** The first milestone approval authorizes fork creation; subsequent approval authorizes its push and continuation. Local commits for integration/review are permitted. Only the coordinator performs pushes.

Use isolated worktrees and the [agent ownership contract](docs/AGENT_OWNERSHIP.md). Establish shared interfaces before concurrent implementation. The coordinator owns schema migrations and integration. Obtain independent review from an agent that did not author the reviewed change.

## Data and provenance

- Preserve the upstream Git history, AGPL license, and attribution in [UPSTREAM.md](docs/UPSTREAM.md).
- Preserve the MIT license/attribution when importing reusable LaTeX assets in M2.
- Keep personal KBs, resumes, credentials, email, application records, runtime files, and backups outside Git. Use fictional test/demo data.
- Do not modify existing external V5 templates, skills, or historical application materials.
- The KB is assembled from the application's Profile, Work History, and Projects. Uploaded resumes are references, not automatic validated-fact updates.
- Freeze complete KB/JD snapshots for tailoring; retain historical source and submission versions.

## Execution and verification

- Local-only, single-user Docker installation; do not deploy or add hosted accounts/billing.
- Discovery and tailoring are separate. Discovery never auto-enqueues tailoring; only one application is tailored at a time.
- Preserve V5 evidence, exact-five selection, source protection, and document verification. Provider choice does not waive output checks.
- Never silently substitute API billing for subscription-authenticated Codex or silently drop evidence to fit model context.
- Compilation uses a current working copy and disables shell escape. Do not mark unverified artifacts ready.
- No automatic application submission or external assistant connector in V1.
- Keep credentials out of logs, screenshots, test fixtures, exports, and commits.

Run the upstream lint/type checks and applicable unit, database, and browser tests. Record actual results, including baseline failures and unavailable checks. Do not fabricate success or weaken checks simply to obtain a passing result. Review code and rendered behavior as appropriate; preserve useful upstream tests.
