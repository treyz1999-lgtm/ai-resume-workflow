# M6 review

M5 was approved and pushed at 8865604. M6 is local on milestone/m6.

## Gmail status review

Open Inbox → Application updates and choose Check updates. Google must be connected with Gmail read permission and inbox reading enabled. The review uses the execution provider selected in Discovery, including subscription-authenticated Codex or the configured hosted/local model.

The report reads complete relevant threads from seven calendar days ago through today, inclusive, using the app timezone. Each finding retains its message/thread reference and evidence. Receipts, marketing, sent messages and quoted older outcomes are excluded. Findings are processed chronologically. A newer recorded status prevents an older email from overwriting it.

An exact supported company and role match to one submitted attempt can update the tracker automatically. Multiple plausible reapplications require a user choice. Unmatched findings can be linked to an existing submitted attempt or dismissed. The report shows counts and warnings if a thread or classification could not be completed.

## Calendar

Calendar remains optional. Adding, moving or removing an interview shows the proposed event effect before confirmation. Confirmation checks that the proposal still matches current settings/event details. Inbox drafting and explicit-send controls remain available.

## Choices and limits

- Exact normalized company/role matching is conservative. Different titles and uncertain emails remain available for review.
- AI classification is grounded in quoted message evidence. Model errors remain possible, so the report links to the source thread.
- Checks are explicit user actions. A single check reads up to 500 matching threads and reports when the limit is exceeded. A full thread over 8 MiB is reported rather than shortened.
- Earlier saved findings remain in the report. Rechecking deduplicates recorded messages; a later application notification can produce a new finding.
- Tests use fictional Google and model services. Live Gmail and Calendar authorization is optional and belongs to the user's sign-in flow.
- Complete backup/export support for these records is part of M7.

## Verification

Lint, TypeScript and production builds passed. The configured Vitest suite passed 1,882 tests with 29 skips and met all coverage thresholds. Tests exercise rejection, interview, assessment, offer, withdrawal and progress updates, quoted outcomes, receipts, ambiguous reapplications, concurrent application creation, stale findings, complete MIME bodies and provider failures.

All eight selected browser checks passed against fictional Google services. They cover status review, calendar changes, dashboard dates, and existing explicit-send functionality. The final status-report rerun also passed the accessibility check with no serious or critical findings. Fake-service state confirmed that checking status updates sent no mail and changed no calendar events.

Independent review found the application matching race and the date-window wording mismatch. Both were corrected. The matching regression verifies that a second application recorded during model classification forces review.

The local Docker application and worker started successfully. Review the fictional screenshot at runtime/m6/status-report.png and the logs at runtime/m6-final-regression.log, runtime/m6-browser.log, runtime/m6-browser-final.log and runtime/m6-final-local-build.log.

Inspect the local changes with git diff 8865604..HEAD.
