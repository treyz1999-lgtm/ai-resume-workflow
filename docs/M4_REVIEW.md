# M4 — sequential V5 tailoring

Open [Tailoring](http://localhost:3000/tailoring) to pause the queue, reorder waiting roles, remove a selection, cancel a preparation, or retry a blocked attempt. Select roles from Discovery. The queue starts enabled. Pausing lets the active preparation finish and holds subsequent roles.

## From selection to verified documents

At claim time, a PostgreSQL transaction freezes the posting text, profile KB, track and cover-letter options. A unique index permits one running preparation. A worker that loses its lease loses permission to write. An interrupted run continues from its saved plan, edited content, or rendered documents.

The planner compares the complete project inventory and freezes five eligible IDs before the application resolves a template. The editor can display a subset appropriate to the SWE or Data variant. It uses configured work-history inclusion, project links, protected fields and quoted KB evidence. The reviewer compares the resulting PDF text with the JD and KB. The final score weights core requirements twice as heavily as preferences and credits only evidence demonstrated in the resume.

A passing preparation moves to **Pending submission** with its PDF, editable source, match report and verification record. An explicit Dossier theme produces a PDF and an editable JSON snapshot of the theme and content. Cover letters use the local LaTeX template. Submission tracking is the next milestone.

## Review and recovery

- A portfolio with fewer than five eligible projects produces an actionable blocker. After correcting the library, retrying that attempt captures the updated KB.
- A retry following a document-content or verification failure keeps the frozen selection and asks the editor to revise the content. Earlier revisions and the reason for rejection stay in the attempt history. A transport failure can resume from the last successful stage.
- Verification checks the compiled PDF, page count, text bounds, protected content and embedded link destinations. It does not test external website availability. Source-quote checks and model review support claim verification. Visual review remains useful for spacing and readability.
- The local install needs Docker. The worker image includes pdfLaTeX, Poppler and fonts. Running document tools outside Docker requires the equivalent local tools. The M4 end-to-end suite uses an internal fixture worker with the fictional Playwright secret, configured via `E2E_WORKER_URL`.

Compare the milestone locally with `git diff 4a80735..HEAD`. All review artifacts use fictional profiles and JDs.

## Acceptance results

- The production Docker images built and started. Lint and TypeScript passed. Vitest recorded 1,823 passes and 29 skips in its configured suite, with all configured coverage thresholds met. The separate compiler-enabled worker run passed all four tests.
- Chromium passed all eight targeted checks, including Discovery intake, retry after extending an undersized KB, SWE and Data LaTeX, cover letter on/off, themed PDF verification, and queue ordering after reload. Browser preparations used a fictional model service and the real rendering tools.
- A separate ChatGPT subscription run exercised the production worker directly. The planner evaluated six fictional projects and froze five. The Data editor displayed two and produced six cited claims. After resuming the saved checkpoint, the reviewer verified the one-page PDF with three embedded links and scored its alignment with the fictional JD at 100.
- The live check caught an empty Experience heading and a reviewer instruction that conflated the frozen project list with the displayed projects. Both were corrected. A browser regression also checks a Chromium PDF that omits word spaces during text extraction.
- The local-model/API route resolves the configured connection at each stage. Changing that setting during a running preparation can change which model completes subsequent stages.
- Local examples are in the ignored runtime/m4 directory, including live-fictional-resume.pdf and queue-swe-theme.png. Review the local changes with git diff 4a80735..HEAD.
