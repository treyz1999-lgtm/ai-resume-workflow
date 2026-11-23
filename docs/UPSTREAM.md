# Upstream provenance and fork contributions

AI Resume Workflow is a derivative of [AienTech/dossier](https://github.com/AienTech/dossier), published as [treyz1999-lgtm/ai-resume-workflow](https://github.com/treyz1999-lgtm/ai-resume-workflow).

| Item | Baseline |
| --- | --- |
| Upstream repository | `https://github.com/AienTech/dossier.git` |
| Pinned commit | `3271c8b2900082e0caa1ed42765b71d28134c0c1` |
| Upstream version | Dossier 1.9.1 |
| Fork name | AI Resume Workflow |
| License | AGPL-3.0-only; see [LICENSE](../LICENSE) |

Upstream Git history, copyright notices and license are preserved. The unmodified [upstream README](UPSTREAM_README.md) documents upstream authorship and capabilities; its installation links and release claims are not this fork's current instructions. Use the fork [README](../README.md).

## Contribution boundaries

| Retained from Dossier | Added or substantially adapted in this fork |
| --- | --- |
| Next.js/React/TypeScript, Prisma/PostgreSQL, existing components and tests | Internal execution worker, durable claims/leases/checkpoints and ChatGPT-authenticated Codex app-server |
| Structured profile and skill/experience/project editors | Complete versioned profile-derived KB, evidence/ownership context and project architecture notes |
| Twelve resume themes, document editing/history and PDF rendering | V5 SWE/Data LaTeX composition, full-inventory exact-five planning, evidence checks, PDF inspection and sequential preparation |
| Job source adapters, startup discovery and search settings | Scheduled independent discovery, occurrence/repost handling, explicit tailoring selection and separate coverage scores |
| Application board, table, dashboard and notes | Exact submitted-revision/score freezing, reapplication attempts, review queue and tracker CSV |
| Gmail/Calendar and model-provider integrations | Evidence-based status review, ambiguous reapplication handling, confirmed Calendar effects and no subscription-to-API fallback |
| Existing export/import foundations | M7 versioned full workflow archives, secret exclusion, preparation-count backups and verified fresh-install recovery (V1 approved) |

These boundaries support portfolio descriptions without presenting upstream work as original. Use measured acceptance from [release evidence](RELEASE.md), identify fixture versus live checks, and use the fork tag `workflow-v1.0.0` rather than inherited upstream release tags. Personal records and external V5 masters are not distributed with the fork.

## LaTeX attribution

The V5 renderer in `src/lib/templates/v5.ts` adapts Jake Gutierrez's MIT-licensed resume layout, based on sb2nov/resume. The original MIT notice is retained in [templates/v5/LICENSE](../templates/v5/LICENSE). SWE and Data share the pdfLaTeX formatting master, with per-variant composition and work-history inclusion. The reusable formatting is parameterized; personal contact, employer, date and project content is input data. See [template provenance](../templates/v5/README.md). Existing external source masters remain unchanged.

## Updating upstream

Fetch upstream explicitly and review changes against the pinned baseline before integrating. Never silently replace this fork's image with upstream's or present upstream release prompts as fork upgrades. Record later upstream merges in Git and release notes. Upstream telemetry and update prompts are disabled. Release pushes and tags remain coordinator-only after the user's milestone approval.
