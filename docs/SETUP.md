# Local setup and connections

## Installation and storage

Follow the README's configuration generator, then use `docker compose -f compose.production.yml up -d --build`. The fork builds local source images; it does not pull the upstream application image. Docker must have Linux containers enabled. Build time and disk use depend on cached Node, browser and TeX packages.

Create `backups/` before startup. On Linux, grant the app's UID 1000 write access to that directory (for example `sudo chown 1000:1000 backups` for this directory only). Windows/macOS Docker Desktop mediates bind-mount permissions. A backup failure must be resolved before relying on recovery.

| Storage | Contents |
| --- | --- |
| `pgdata` volume | Profile, KB snapshots, postings, workflow state, documents, tracker and settings |
| `appdata` volume | Application-managed files and temporary exports |
| `execution_data` volume | Worker workspaces and diagnostic artifacts |
| `codex_auth` volume | Codex ChatGPT authentication; excluded from normal backups |
| `ollama` volume | Optional downloaded local models |
| `./backups` host folder | Backup archives, mounted at `/data/backups` |

Compose prefixes volume names with its project name. The default is `ai-resume-workflow`. Use `-p DISTINCT_NAME`, a different `DOSSIER_PORT`, and a separate backup folder override for isolated experiments. Never attach a test installation to production volumes. Both supplied Compose files otherwise use the same project and data.

The default web address is `http://localhost:3000`. Change `DOSSIER_PORT` in `.env` to use another port. Keep the app local. Do not publish PostgreSQL or worker ports. `docker compose -f compose.production.yml stop` preserves storage; use the matching `start` command to resume. `down` removes containers/network but preserves named volumes unless `--volumes` is added.

## ChatGPT subscription execution

Open Settings → Connections, start ChatGPT sign-in, and follow the displayed device link/code yourself. Authentication stays in the worker's separate `codex_auth` volume. The app does not copy your host Codex session. Refresh the connection, choose an available model, then run the structured connection test. The screen reports progress, cancellation and available usage windows.

Choose the subscription connection in Discovery for workflow execution. Quota or authentication failures preserve resumable work; reconnect or wait for allowance recovery, then retry. No API key is substituted automatically. The bundled Codex version is pinned in the Dockerfile; account availability and model permissions belong to the signed-in account.

## API and local models

Configure the retained AI provider settings with the provider, model, endpoint and API key where required. API billing is separate from a ChatGPT subscription. API-compatible, Anthropic, Mistral, LM Studio and local/Ollama settings are inherited; select the configured provider for discovery/tailoring. Changing a connection during a run can change the model used in a later stage.

For the optional Docker Ollama service:

```sh
docker compose -f compose.production.yml up -d ollama
docker compose -f compose.production.yml exec ollama ollama pull MODEL_NAME
```

Set its endpoint to `http://ollama:11434`. For a host model server, use `http://host.docker.internal:PORT`, not `localhost` inside a container. The server must accept Docker's connection. Local models can execute the workflow; they must support its structured output and complete KB/JD context. There is no quality-based provider exclusion and no silent evidence truncation. A transport test alone does not establish model suitability.

## First preparation

1. Populate Profile, then Knowledge base with work/project evidence, ownership boundaries, architecture context and track inclusion settings. Personal migration is explicit; no personal profile is hardcoded.
2. Add at least five eligible projects. The planner freezes exactly five candidates before template access; the editor can display the subset appropriate to the selected track.
3. Set discovery preferences and choose a source. JSearch requires its own key; YC and Hacker News sources use public data. Paste the full JD if a URL cannot be fetched.
4. Start a scan, schedule, or bounded session. Scheduling defaults off; interval defaults to ten minutes and supports one to sixty minutes. A scan already underway may finish after a session expires.
5. Select findings to queue. Tailoring is sequential; pause holds subsequent work while the active preparation finishes.
6. Review the PDF, evidence and report. Mark the exact versions submitted only after you actually submit them. Revisions require verification again; previous submissions stay frozen.

Discovery scores describe KB coverage. Outcome analytics use verified submitted-resume scores. These are not estimates of an employer's ATS or interview probability.

## Optional Google integration

Configure a Google OAuth Web application client in Settings → Google or supported environment settings. Enable the required Gmail/Calendar APIs and register the exact local callback, such as `http://localhost:3000/api/google/callback` (adjust for your port). Finish authorization in the browser and grant only the integrations you intend to use.

Inbox → Application updates → Check updates reads relevant full threads and updates confidently matched submitted attempts. Ambiguous reapplications require review. Checks use the selected execution connection. Sending mail remains an explicit action; Calendar changes show a proposal for confirmation. No application is automatically submitted. After restoring a backup, reconnect integrations and reenter credentials.
