# Release, backup and recovery

M7 is implemented and verified locally, awaiting user approval. Do not treat the current branch as an approved/tagged V1 release. The coordinator records final clean-install, restore, regression and accessibility evidence in the milestone review. Only user approval authorizes the release push and tag.

## Backup policy

The M7 full-archive contract uses checksummed version-1 JSON and `/api/workflow-backups`. The host-visible `backups/` directory is mounted at `/data/backups`. Backups contain profile/KB history, architecture assets, document references and generated revisions/sources/reports, workflow/discovery/tracker history and non-secret settings. They exclude API keys, Google authentication tokens and the separate Codex authentication volume. Archives still contain sensitive personal content and belong outside Git.

The default automatic interval is **ten newly ready application preparations**, retaining **ten automatic archives**. Manual backups remain until explicitly deleted. Retries/revisions must not inflate the completed-preparation count. Backup frequency is configurable. Automatic archives are not hourly backups and are not triggered by discovery alone.

Open Settings → Backups (`/settings/backups`) to create a manual backup, download an archive, configure the preparation interval/retention, or preview a restore before confirming it. Use the manual backup control before upgrades or data migration. Keep a copy on another trusted storage device if recovery from disk failure matters: a folder on the same disk does not protect against that disk failing. Do not copy a running PostgreSQL volume as a substitute for a validated application archive.

For recovery, start the compatible application version with fresh volumes and private local configuration. Open Settings → Backups, choose the downloaded archive, inspect its preview, then confirm restore. Restore replaces the target application records and first writes a before-import backup. Pause/cancel active work before restoring. The restored tailoring queue is paused and discovery scheduling is disabled; reconnect providers and explicitly resume when ready. Template masters must match the installed version, and the payload checksum must validate. Preserve the original installation until the restored data and documents have been checked. Fresh-volume restore and populated-target restore both passed with fictional data; see [M7 review](M7_REVIEW.md) for measurements and limitations. Legacy Dossier JSON imports remain under Settings → Your data. Tracker CSV is a separate interchange format and does not preserve the full application.

## Upgrade procedure

1. Create a manual archive and verify it is present in the host backup directory. Preserve the private `.env` separately; never include credentials in a shareable archive.
2. When upgrading a pre-M7 installation, copy its existing `/data/backups` contents to the host `backups/` folder before enabling the new bind mount; do not overwrite conflicting files. Older Dossier-format archives use the legacy importer. Stop the current installation using its existing Compose file/project. Do not delete volumes.
3. Check out the approved release and review its migration notes. Build/start with `docker compose -f compose.production.yml up -d --build`.
4. Confirm app/worker health, profile and document access. Reconnect integrations if restored into a new installation.

Schema migrations run during startup. Rolling source code back is not automatically a database rollback. Use a validated archive in fresh volumes for recovery, preserving the original volumes until the restored installation has been checked.

## Evidence and contribution claims

| Milestone | Recorded acceptance |
| --- | --- |
| [M1](M1_REVIEW.md) | Real ChatGPT-authenticated structured task, auth surviving restart; local PDF sample; fixture cancellation/quota tests |
| [M2](M2_REVIEW.md) | KB history, reference upload/download, SWE/Data/letter compilation; 1,730 tests passed |
| [M3](M3_REVIEW.md) | Scheduling, dedup/repost and explicit selection; real Codex fictional coverage request; 1,788 tests passed |
| [M4](M4_REVIEW.md) | Sequential preparation, SWE/Data/theme and letter cases, real fictional Codex/Data PDF run; 1,823 tests passed |
| [M5](M5_REVIEW.md) | Exact submission history, revisions, tracker CSV and dashboard consistency; 1,856 tests passed |
| [M6](M6_REVIEW.md) | Fictional Gmail/Calendar integration, conservative matching and chronology; 1,882 tests passed |
| [M7](M7_REVIEW.md) | Fresh and populated-target restoration passed; 1,897 unit/database and 156 browser tests passed; user approval pending |

Counts reflect those historical runs, not cumulative independent tests or a promise that every model/provider works. Live Google/paid source tests were not required for fixture acceptance. Screenshots and generated sample artifacts must use fictional records. Consult [UPSTREAM.md](UPSTREAM.md) to distinguish inherited functionality from fork contributions.
