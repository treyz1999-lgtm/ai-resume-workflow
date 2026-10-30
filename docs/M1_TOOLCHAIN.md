# M1 local execution toolchain

The Docker worker bundles Codex CLI **0.165.0**, pdfLaTeX from Debian TeX Live, Poppler (`pdfinfo`/`pdftotext`), and the existing Playwright Chromium installation. No host TeX installation is required for Docker use. Host-only development must install equivalent tools. M2 will register the V5 templates; M1 compiles only the fixed fictional sample.

The compiler package set covers the registered master's fontenc, lmodern, geometry, titlesec, enumitem, babel, needspace, hyperref, and glyphtounicode requirements. A successful sample verifies one page and expected extracted text. It does not certify every future resume's content or layout. Compilation disables shell escape and has a 30-second process timeout with a bounded output buffer.

Run the usual `docker compose up -d --build`. The app applies migrations; the worker starts after the app is healthy. The worker source is baked into its image, so rebuild it after worker code changes. Development and production Compose files use the same internal service contract. Only the app publishes a host port, on localhost. Worker port 4310 and PostgreSQL are internal; the worker never mounts the Docker socket.

In Settings → Connections, use the ChatGPT sign-in flow. The app displays a device code and link; finish authentication yourself, then run the connection test. Existing API/local model settings remain separate. No subscription session is copied from the host Codex installation and no API billing fallback is configured.

Storage is separated:

| Volume | Contents |
| --- | --- |
| `pgdata` | Application records and execution checkpoints |
| `appdata` | Existing app files and upstream backups |
| `execution_data` | Local execution work and generated sample artifacts |
| `codex_auth` | Codex-managed ChatGPT credentials, excluded from ordinary app backups |

Never export or commit `codex_auth`, or include it in a backup intended for sharing. Future M7 backups must restore non-secret records/artifacts and ask the user to reconnect. Stopping/rebuilding services preserves volumes. `docker compose down --volumes` deletes stored data and credentials.

The worker currently retains development dependencies to run TypeScript and generate its Prisma client; release image-size reduction is deferred. Full real-account acceptance requires a successful user-authenticated turn, not just fixture tests or seeing a model in the catalog.
