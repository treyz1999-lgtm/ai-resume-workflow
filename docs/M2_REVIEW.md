# M2 — ready for review

November 3, 2026. M1 was approved and pushed as `39d27b2`. M2 remains local on `milestone/m2`; no M2 push or M3 work until approval.

## Working features

- Existing Profile remains the authoritative editor for identity, skills, work, projects, education and global facts. New **Knowledge base** adds project/work evidence, ownership boundaries, architecture explanation, editable Mermaid source and PNG/JPEG diagram uploads. Work roles have independent SWE/Data inclusion switches.
- Complete KB snapshots include all profile records, skill links, global facts and matching extra context. Reading the KB or saving context captures changed content as a new immutable version; unchanged content reuses the latest version. Capture locks provide a consistent view while profile edits occur. Application-specific facts and uploaded resumes are excluded. Old versions remain accessible.
- Discovery preferences support similar role titles, locations, work arrangements, excluded companies, salary/currency and explicit constraints. Tailoring defaults provide Auto/SWE/Data, LaTeX by default, all twelve retained HTML themes as overrides, and cover-letter on/off. M3/M4 will consume these settings.
- **Resume library** accepts PDF references up to 10 MB, creates a first-page preview locally, retains historical uploads and offers byte-preserving downloads. It never imports uploaded claims into the KB automatically.
- Parameterized V5 SWE/Data layouts retain the master formatting and MIT notice. Employers/dates/contact/project prose come from input. A basic cover-letter layout is included. The library compiles fictional examples and exposes PDF, editable LaTeX and rendered previews. Template masters and personal source sections remain untouched and outside Git.

## Acceptance evidence

- Docker production application and worker build passed; additive migrations applied and application healthy.
- Full lint/type/unit/database/coverage run: **1,730 passed, 26 live tests skipped**. Coverage met unchanged thresholds: statements 86.15%, branches 79.54%, functions 84.37%, lines 88.33%.
- Final targeted lint/type/test run after integration fixes: **41 tests passed**.
- **80 browser tests passed**, including complete snapshot capture, editing/re-saving context, new profile evidence, and unchanged historical versions. Four additional new-page accessibility checks passed in light/dark layouts (five with authentication setup).
- Docker compiled SWE, Data and cover letter to one page with readable text; each actual raster was inspected. Data includes its configured second work role, while SWE excludes it. Both retain five fictional projects and project links.
- Live library upload of the fictional SWE PDF succeeded; 1020×1320 preview loaded. Redownloaded bytes matched the original SHA-256. Live Data template compilation also succeeded through the application UI.
- Independent agents reviewed snapshot consistency, strict input schemas and library security. Fixed re-save requests accidentally including Prisma metadata, Unicode action-size allowance, and temporary upload cleanup after worker interruption.
- External master `main.tex` hash still matches `701174D01AF2568A474618A148C7626611F3C916752884F4896F217277948B01`. No personal sections were committed.

Ignored local evidence: `runtime/m2-full-checks.log`, `runtime/m2-browser-tests.log`, `runtime/m2-new-accessibility.log`, `runtime/m2-final-targeted.log`, and `runtime/m2/` (fixture PDFs, images and library screenshot).

## Limits and deferred work

- Personal profile/KB migration is deliberately deferred; the live profile remains empty. One fictional `swe.pdf` reference was added for review.
- Mermaid is stored as editable source; visual diagram previews use uploaded PNG/JPEG (512 KB maximum). It does not yet render Mermaid automatically.
- Library upload supports PDFs; the in-app preview shows the first page. Download preserves every page. Encrypted/unrenderable PDFs are rejected without adding an asset.
- Template previews use fictional data, not a tailoring run. Discovery, automatic track selection, real tailored outputs and cover-letter generation follow in M3/M4. A selected HTML theme remains a future tailoring override; its existing base-resume renderer is retained.
- Snapshot creation is on KB access/context save, not every profile keystroke. The next workflow capture will read the complete latest profile. Old snapshots do not update.
- New snapshots, architecture context and reference documents persist in PostgreSQL. Their inclusion in the versioned export/backup/restore format is M7 work; the existing upstream export does not yet include these new tables.

## Review

Open `/knowledge` and `/library` at `http://localhost:3000`. Run `git diff origin/main...HEAD` for committed M2 changes, plus `git diff` for any local remainder. No deployment, external application submission or personal data migration occurred.
