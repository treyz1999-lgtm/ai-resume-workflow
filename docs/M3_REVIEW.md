# M3 review — scheduled discovery and posting intake

Open [Discovery](http://localhost:3000/discovery) in the local Docker installation. The comparison baseline is the approved M2 commit `e998bdf`. Run `git diff e998bdf..HEAD` on `milestone/m3` for the local implementation diff.

## Try it

1. Set desired roles and locations under **Knowledge base → Discovery preferences**. Open **Discovery** to choose JSearch, YC jobs, or Hacker News hiring. JSearch uses the credential from Job search settings.
2. Choose the ChatGPT subscription connection or the configured API/local model. Weekly scheduling starts off. Set days, times, timezone and a scan interval from one to sixty minutes. The default interval is ten minutes. A quick session allows scans for one, two or three hours.
3. Use **Scan now**, paste a public posting URL, or paste a full JD. If a site blocks fetching, paste its description. A scan captures the KB, records source outcomes and shows extracted fields with original wording where available.
4. Open a finding to inspect the JD, strengths, gaps, and supporting quotes. Save or dismiss the occurrence. Explicitly select one or more complete, analyzed roles to place them on the tailoring waiting list. Remove a selection to take it off that list.

## Acceptance evidence

The fictional browser fixture uses a required SQL skill, an optional Python skill and a project with validated SQL evidence. The result shows **67% weighted evidence alignment** (2 out of 3 possible points) and **50% keyword coverage** (1 of 2 terms). The browser test saves the role, selects it, removes the selection, dismisses the role and verifies that both application and document counts match the initial counts.

Real PostgreSQL tests cover simultaneous scan requests, atomic claims, expired leases, source failures, failed analysis, retries using the frozen KB, and reuse of successful coverage. Tests exercise session expiry, overnight windows, and skipping missed intervals. Repeated sightings preserve their occurrence. Distinct posting dates create separate occurrences. An incomplete result can gain a full description from a later sighting. A legacy scan with automatic drafting previously enabled creates zero drafts.

The coordinator supplied the schema, migration and integration. The workflow, product and source agents supplied the scheduler, UI and adapters in separate worktrees. Independent review identified issues with Unicode request decoding, distinguishing posting dates from deadlines, generic startup pages being treated as full JDs and expired sessions displaying as active. The integrated changes address those findings.

## Verification

Checks completed November 12, 2026:

- Lint, TypeScript and the standalone production build passed. Vitest passed 1,788 tests and skipped 26 opt-in live tests. Coverage reached 85.89% of statements and 88.37% of lines. All configured thresholds passed.
- Five Playwright checks passed, including sign-in, light and dark discovery accessibility, the former Agent redirect, and the pasted-JD selection flow. The fictional screenshot is `runtime/m3/discovery-result.png`.
- Docker Compose rebuilt and started the local web and worker services against the existing PostgreSQL volume. A real ChatGPT-authenticated Codex request to the worker returned HTTP 200. It quoted the fictional SQL project for the required skill, marked preferred Python absent, and preserved unknown compensation and location. The model proposed three literal keywords in this live request. The browser fixture uses two deterministic keywords.
- Source adapter checks used fixtures. The review did not exercise a paid JSearch account or a live job board scan. Local verification logs are in `runtime/m3-final-regression.log`, `runtime/m3-final-browser.log` and `runtime/m3-local-build.log`.

## Discovery behavior and limits

- Startup and JSearch adapters rely on public source data. Missing dates, locations and compensation remain unknown. Reposts with insufficient date evidence remain grouped. Generic startup links may leave a finding incomplete until a full JD is supplied.
- Similar-title and location matching use words and known title variants. Salary filtering needs a comparable currency and pay period. Review other free-text constraints against the posting. JSearch accepts up to twelve role/location combinations per scan.
- If another scan is active, the intake form keeps a new pasted JD for resubmission. A session that expires allows its current scan to finish. Quota and authentication failures can be retried after the connection recovers.
- The full KB and JD must fit the selected model and worker transport. Source-evidence validation checks quoted wording. The user reviews the model's interpretation of whether a quote demonstrates a requirement.
- Waiting selections feed the sequential tailoring workflow planned for M4. M3 data persists in the local PostgreSQL volume. Backup/export coverage for new discovery records is planned for M7.
