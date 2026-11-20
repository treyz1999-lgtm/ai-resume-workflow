# M5 review

M4 was approved and pushed to origin/main at 17ba146. M5 is local on milestone/m5.

## Review and submission

Open Tailoring and choose Review documents. The screen displays the rendered PDF page, source downloads, verification results, evidence quotes, weighted alignment report, and project selection rationale.

Choose a document version and record its submission date. The tracker stores that exact resume revision, optional letter revision, alignment score, and scoring method. Concurrent confirmations are idempotent. A repost produces a separate application attempt.

Manual statement edits and refinement requests create a new generation in the sequential queue. Restoring an earlier version also creates a new generation and runs verification again. Earlier PDFs remain available. Later edits cannot replace the recorded submission.

The Applications board, table, detail page and dashboard read the same tracker records. Submitted scores feed outcome analytics. The detail page shows the recorded PDF preview and links back to its reviewed version.

## Tracker CSV

Open /applications/tracker to preview an uploaded CSV before importing. Repeated imports skip existing IDs. Distinct attempts remain separate. The export preserves V5 tracker fields and includes local IDs, posting URLs, salary units, experience bands and submitted score metadata.

Imported score text remains historical metadata. Outcome score analytics require a locally recorded submission with verified document revisions. CSV files retain displayed cell values, so a spreadsheet hyperlink requires an explicit posting_url column to preserve its destination.

## Implementation choices and limits

- The preview is generated from the actual PDF. Open PDF and Download PDF provide the full document.
- Manual editing applies to evidence-backed statements. Protected profile fields remain governed by the KB, and the review agent checks revised claims.
- Deleting an application deliberately removes its submission record and returns its retained verified preparation to Pending submission. This also applies to legacy replace-import.
- Existing Dossier JSON exports do not yet include M5 submission records, document revisions or tracker metadata. Complete backup and versioned restore compatibility belongs to M7.
- Model judgement and the rendering checks retain the verification limits described in M4_REVIEW.md.

## Verification

Lint, TypeScript and the production build passed. The complete configured Vitest run passed 1,856 tests with 29 skips and met all configured coverage thresholds. Regression coverage includes concurrent submissions and edits, wrong-attempt documents, date handling in Phoenix, historical version recovery, CSV retries and submitted-score isolation.

The nine targeted browser checks passed across the initial run and the corrected rerun. The initial CSV test had an ambiguous status selector. The rerun passed all six selected checks, including that CSV path and the extended Data flow through submission, manual edit, restore, refinement, the original tracker PDF, the table and dashboard. An additional 79 preview and database-loader tests passed.

Both builds succeeded, and the production Docker app and worker started successfully. The app is available at http://localhost:3000. The fixture screenshot is runtime/m5/document-review.png. The browser log records a response-stream closure during page navigation; all affected document assertions passed.

Local check logs are runtime/m5-final-regression.log, runtime/m5-browser-final.log, runtime/m5-preview-tests.log and runtime/m5-local-build.log. Browser checks used fictional model responses and real local PDF tools. Independent review found no remaining M5 blocker.

Review the local changes with git diff 17ba146..HEAD.
