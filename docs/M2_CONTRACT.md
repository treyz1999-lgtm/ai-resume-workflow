# M2 shared contracts

M1 approved and pushed November 2, 2026. M2 is local until its review gate.

Coordinator owns schema, migrations, resume library, sidebar/navigation, template HTTP integration, and integration. Product owns new `/knowledge` page/components/actions only. Workflow owns `src/lib/knowledge.ts`, `src/lib/knowledge-contracts.ts`, and corresponding tests. Infrastructure owns `templates/v5/`, `src/lib/templates/`, and tests; no personal source sections enter Git.

Prisma models: KnowledgeDetail has composite kind/entryId (`project` or `experience`), context, architecture (Mermaid text), architectureImage (validated PNG/JPEG data URL or empty), includeSwe/includeData, updatedAt. Details must refer to existing records; snapshots omit orphaned details. KnowledgeSnapshot stores monotonically increasing version, schemaVersion=1, digest, immutable JSON payload, createdAt. ResumeAsset stores uploaded bytes in PostgreSQL, filename, MIME, size, digest, timestamp. No uploads update profile facts.

Workflow exports:
- `captureKnowledgeSnapshot()` returns Prisma KnowledgeSnapshot, capturing all profile fields, skills/links, languages, roles, projects, education, publications, references, global facts and matching KnowledgeDetail records in one consistent transaction. Same content reuses latest snapshot; change creates immutable next snapshot under an advisory lock. Exclude timestamps from digest. No truncation.
- `loadKnowledgeEditor()` returns `{ projects: {id,name}[], experience: {id,role,company}[], details: KnowledgeDetail[], snapshots: {id,version,digest,createdAt}[] }`.
- `saveKnowledgeDetail(input)` validates existing entry and upserts then captures snapshot. Input schema exported as `knowledgeDetailSchema` from knowledge-contracts.
- `discoveryPreferencesSchema`, `tailoringPreferencesSchema`, defaults and types from knowledge-contracts. `loadWorkflowPreferences()` returns `{discovery,tailoring}`; `saveWorkflowPreferences({discovery,tailoring})` validates and persists Setting keys `workflow.discovery`/`workflow.tailoring`.
- Discovery: roles:string[], locations:string[], workArrangements:string[], excludedCompanies:string[], minimumSalary:number|null, salaryCurrency:string, constraints:string. Titles are preferences for semantic matching; explicit constraints remain explicit.
- Tailoring: track:'auto'|'swe'|'data', themeId:string|null (null=LaTeX), coverLetter:boolean. Defaults auto/null/false. Twelve existing themes remain unchanged.

Product `/knowledge` UI offers editable project/work context with architecture explanation/Mermaid source or PNG/JPEG upload, per-role SWE/Data inclusion, complete current KB view/history, discovery and tailoring options including existing themes. Existing profile editor remains authoritative for identities/dates/basic bullets; link to it and resume library `/library`. Read captures latest complete snapshot so profile edits appear without mutating history. This deliberately avoids saving a snapshot on every keystroke.

Template module exports from `src/lib/templates/v5.ts`: `renderV5Resume(track: 'swe'|'data', input: V5ResumeInput): string`, `renderCoverLetter(input: CoverLetterInput): string`, `fictionalResume: V5ResumeInput`, `fictionalCoverLetter: CoverLetterInput`. Types include data-driven contact, education, skills, experience (includeSwe/includeData), projects, prose; no real personal facts. Return self-contained safe escaped LaTeX. Master layout/macros and MIT attribution retained; original external files untouched and hashes checked. SWE/Data inclusion comes from input; no hardcoded employers/dates. M2 fixture generation/compile only, no tailoring agent. Coordinator adds authenticated fixture-compile route/UI through worker with server-owned templates, not arbitrary user TeX.
