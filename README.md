# AI Resume Workflow

A local, single-user Docker application for evidence-backed resume preparation and application tracking, forked from [Dossier](https://github.com/AienTech/dossier).

Profile, work history and projects form your knowledge base. Discover roles or paste a job description, explicitly queue a preparation, review its locally rendered documents, and record the exact version you submitted. Discovery never submits applications or starts tailoring on its own.

**Status:** M1–M7 functionality is implemented locally; the [M7 review](docs/M7_REVIEW.md) is ready for user approval. This is not yet a tagged V1 release. See the [milestone plan](docs/V1_PLAN.md) and individual review reports for measured results and limitations. Each milestone ends with user review before a push or continuation.

## What it includes

- Profile-derived, immutable KB snapshots; project evidence and architecture notes; reference-resume library.
- Scheduled discovery and pasted URL/JD intake, repost-aware occurrences, requirement coverage and explicit single/bulk queue selection.
- Sequential V5 planner/editor/reviewer preparation with full KB/JD context, five frozen candidate projects, SWE/Data LaTeX presets and twelve optional HTML themes.
- Local PDF compilation, evidence and layout checks, optional cover letters, document review, revisions and source downloads.
- Board/table/dashboard tracking, notes, CSV import/export and exact submitted-version scoring.
- Optional Gmail status checks with ambiguous matches held for review; optional confirmed Calendar changes.
- Checksummed full-workflow backups, preparation-count scheduling, host-visible archives and confirmed restore.
- ChatGPT-authenticated Codex execution, plus retained API and local-model settings. No silent switch from subscription execution to API billing.

Model interpretation can be wrong. Review the evidence, reports and actual PDF before submitting. Verification checks embedded link destinations, not whether remote websites are currently available. Mermaid architecture source is editable; visual diagram previews currently use uploaded PNG/JPEG files.

## Start locally

Install Docker Desktop with Linux containers, or Docker Engine and Compose on Linux. From the checkout, generate local configuration with Node 24.7 or newer:

```sh
node scripts/setup-local.mjs
```

No host Node? PowerShell:

```powershell
docker run --rm -it --mount "type=bind,source=$($PWD.Path),target=/app" -w /app node:24-trixie-slim node scripts/setup-local.mjs
```

macOS/Linux:

```sh
docker run --rm -it --user "$(id -u):$(id -g)" --mount "type=bind,source=$(pwd),target=/app" -w /app node:24-trixie-slim node scripts/setup-local.mjs
```

The script prompts for a password, creates `.env` with a password hash and random secrets, and refuses to overwrite existing configuration. Keep `.env` private.

```sh
mkdir backups
docker compose -f compose.production.yml up -d --build
```

On Linux, the `backups` directory must be writable by container UID 1000; see [setup](docs/SETUP.md). Open [localhost:3000](http://localhost:3000). Initial startup applies migrations and seeds empty profile/default settings. Docker bundles Codex, pdfLaTeX, Poppler and Chromium: **no host LaTeX installation is required**. The first build downloads substantial dependencies.

Use Settings → Connections to complete ChatGPT device sign-in and run its connection test. Configure API/local models separately. Populate Profile and Knowledge base, including at least five eligible projects, before tailoring. Read [setup and connections](docs/SETUP.md), [troubleshooting](docs/TROUBLESHOOTING.md), and [architecture](docs/ARCHITECTURE.md).

Only the web app binds a localhost port. PostgreSQL and the worker stay internal. Data persists in Docker volumes; `backups/` is a host-visible bind mount excluded from Git. Never use `docker compose down --volumes` on an installation whose data you want to keep. Hosted model and Google integrations still send relevant data to their providers.

## Development and release evidence

Development uses `docker compose up -d --build`. Do not run development and production configurations simultaneously: they share a project and volumes. See [AGENTS.md](AGENTS.md) for ownership and review gates, [release guide](docs/RELEASE.md) for upgrade/recovery and acceptance evidence, and [DEVELOPMENT.md](DEVELOPMENT.md) for upstream test mechanics.

M6 recorded 1,882 passing Vitest tests, 29 opt-in skips, passing lint/type/build checks and eight selected browser checks. These are historical results, not a claim that every release or every provider was tested. M1, M3 and M4 review reports separately document real ChatGPT-authenticated execution. Local/API transport tests use fixtures; model capability remains user-controlled.

## Attribution

Based on Dossier 1.9.1 at `3271c8b2900082e0caa1ed42765b71d28134c0c1`, retaining its history and [AGPL-3.0 license](LICENSE). The V5 layout derives from Jake Gutierrez's MIT-licensed resume template; its notice is retained in [templates/v5/LICENSE](templates/v5/LICENSE). See [upstream and fork contributions](docs/UPSTREAM.md). Personal KB content, credentials, emails, resumes and application records are outside Git; tests and examples use fictional data.
