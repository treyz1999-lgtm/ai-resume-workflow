# AI Resume Workflow

A local, single-user application adapting [Dossier](https://github.com/AienTech/dossier) to the V5 resume workflow: profile-based knowledge, job discovery, verified tailoring, and application tracking.

**Current status: M0 baseline ready for review.** The existing Dossier interface and features are the starting point. Codex subscription execution, V5 LaTeX tailoring, the new KB/queue, and other V1 changes are planned, not delivered yet. See the [approved milestone plan](docs/V1_PLAN.md) and [upstream provenance](docs/UPSTREAM.md). Each milestone requires review before a push or further implementation.

## Local setup

Use Docker Desktop with Linux containers on Windows/macOS, or Docker Engine with Compose on Linux. Start from this source checkout; the fork builds its own image. Allow time and disk space for the first dependency and browser download.

Create local configuration with Node 24.7 or newer:

```sh
node scripts/setup-local.mjs
```

The script prompts for an application password twice without displaying it, generates a password hash and random database/session secrets, and creates `.env`. It refuses to overwrite an existing `.env`. Do not commit or share this file.

Without a host Node installation, run setup through Docker. PowerShell:

```powershell
docker run --rm -it --mount "type=bind,source=$($PWD.Path),target=/app" -w /app node:24-trixie-slim node scripts/setup-local.mjs
```

macOS/Linux shell:

```sh
docker run --rm -it --user "$(id -u):$(id -g)" --mount "type=bind,source=$(pwd),target=/app" -w /app node:24-trixie-slim node scripts/setup-local.mjs
```

Start the development application:

```sh
docker compose up -d --build
```

Open [localhost:3000](http://localhost:3000) and sign in with the chosen password. The first start generates Prisma files, applies migrations, and seeds the application's initial settings. App access is bound to localhost; PostgreSQL has no published host port. Use `docker compose logs app` for startup diagnostics. Never share logs containing personal content or credentials.

For the production-style local build instead:

```sh
docker compose -f compose.production.yml up -d --build
```

Run only one configuration at a time: both use the same project name and database volume. Stop the current configuration before switching (`docker compose down`, or its `-f compose.production.yml` equivalent). Do not add `--volumes`: it deletes the stored database. Ordinary `stop`/`start` preserves data; use the same Compose file each time.

Database records persist in the `pgdata` Docker volume. Application files persist in the `appdata` Docker volume, which lets the container manage file ownership consistently across operating systems. Both volumes are shared by the development and production configurations. Local private/runtime/auth/backup directories are ignored by Git and Docker build context. Keep real personal records outside source fixtures. M7 will introduce the host-visible backup folder and planned backup/restore system; current upstream backup behavior is not that completed feature.

## Models and integrations

M0 retains upstream model/provider settings. Optional Ollama can run with `docker compose up -d ollama`; pull a chosen model using `docker compose exec ollama ollama pull MODEL`. The app reaches that service at `http://ollama:11434`. For a model server on the host, use `http://host.docker.internal:PORT` with the server's port.

Hosted model calls send the relevant input to the selected provider. Local installation does not make hosted integrations local. **Codex subscription sign-in is scheduled for M1 and is not available yet.** Do not enter a subscription credential into an API-key field or assume existing API settings use subscription billing.

The fork disables upstream usage telemetry and upstream-release prompts; Next.js telemetry is disabled in its Docker environment. Upstream documentation may describe settings or features that differ from this fork. External assistant connectors are excluded from the V1 target; any inherited UI still present during M0 is not a promise of V1 support.

## Development and review

See [AGENTS.md](AGENTS.md) and [agent ownership](docs/AGENT_OWNERSHIP.md) before editing. The coordinator owns shared schemas/migrations and integration. Use fictional fixtures; never import personal resumes, KB content, emails, or application history into Git.

From a running development environment:

```sh
docker compose exec app yarn lint
docker compose exec app yarn typecheck
docker compose exec app yarn test
docker compose exec app yarn build
```

Database tests use a dedicated test database; browser tests require their production build and fixture services. See the upstream [development guide](DEVELOPMENT.md) for test mechanics, and milestone review reports for actual results and limitations. A listed command is not a claim that it passed. Publishing images/releases is disabled during the milestone build; remote fork creation and pushes wait for explicit approval.

## Attribution and license

Based on Dossier 1.9.1 at `3271c8b2900082e0caa1ed42765b71d28134c0c1`, with its Git history and [AGPL-3.0 license](LICENSE) preserved. The [archived upstream README](docs/UPSTREAM_README.md) documents upstream capabilities and authorship, not completed fork features. Reusable LaTeX assets imported in M2 must retain their MIT attribution. See [UPSTREAM.md](docs/UPSTREAM.md) for contribution boundaries.
