# Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Docker cannot connect | Start Docker Desktop/Engine and select Linux containers. Verify `docker info` before rebuilding. |
| Port 3000 is occupied | Set `DOSSIER_PORT` in `.env`, then recreate the app with the same Compose file/project. Update Google callback settings if used. |
| App stays unhealthy | Inspect `docker compose -f compose.production.yml ps` and service logs. Database migrations must complete before the worker starts. Keep secrets and personal content out of shared logs. |
| Settings/configuration is missing | Confirm the correct Compose file, project name and `.env`. Do not generate a replacement over existing secrets or attach arbitrary volumes. |
| Codex disconnected | Settings → Connections: refresh, sign in through the device flow, then run the test. A host Codex login does not authenticate the Docker worker. |
| Codex allowance exhausted | Preserve the blocked run, wait for quota recovery or intentionally choose another connection, then retry. API billing is not an automatic fallback. |
| Local endpoint unreachable | Use `http://ollama:11434` for the Compose service, or `http://host.docker.internal:PORT` for a host server. Container `localhost` is the container itself. Check model availability and server bind settings. |
| Structured output/context failure | Choose a model that can handle the complete KB/JD and schema. Review the reported failure; do not discard KB evidence merely to produce a passing result. |
| No search results | Check selected sources, credentials and preferences; inspect individual source errors. A source failure need not stop the other sources. Paste a full JD when a board blocks retrieval. |
| Tailoring blocked before editing | Ensure at least five eligible projects have evidence. Correct profile/KB input and retry. Never create fictional achievements to bypass selection. |
| Queue does not advance | Check whether it is paused, whether the active run is blocked, and the worker health. Pausing permits the active run to finish. Rebuild worker code changes; it is baked into its image. |
| PDF overflow or failed checks | Inspect the report and actual PDF, revise supported statements and retry verification. Do not mark an unverified version submitted. |
| Backup permission failure | The host `backups/` directory must be writable by container UID 1000. On Linux, fix ownership on that directory only; retry manually and verify the resulting archive. |
| Restored integrations disconnected | Reenter API/OAuth credentials and complete ChatGPT/Google sign-in. Archives deliberately exclude secrets and auth tokens. |
| Development HMR origin error | Use `localhost`, not `127.0.0.1`, with the development server. Production does not depend on HMR. |

For an upgrade, preserve `.env`, volumes and a verified backup first. `docker compose down --volumes` deletes database and authentication storage; it is not a troubleshooting shortcut. See [release and recovery](RELEASE.md).

## Useful commands

```sh
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail 100 app worker
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml stop
```

Run commands from the same checkout and Compose project as the installation. Do not paste raw logs publicly if they contain personal records, model input or credentials. Diagnostic examples and tests must use fictional data.
