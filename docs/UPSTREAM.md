# Upstream provenance

AI Resume Workflow is a derivative of [AienTech/dossier](https://github.com/AienTech/dossier).

| Item | Baseline |
| --- | --- |
| Upstream repository | `https://github.com/AienTech/dossier.git` |
| Pinned commit | `3271c8b2900082e0caa1ed42765b71d28134c0c1` |
| Upstream version | Dossier 1.9.1 |
| Fork working name | AI Resume Workflow |
| Intended fork repository name | `ai-resume-workflow` |
| License | AGPL-3.0-only; see [LICENSE](../LICENSE) |

Preserve upstream Git history, copyright notices, and license. The unmodified upstream README is archived in [UPSTREAM_README.md](UPSTREAM_README.md); its installation links, images, claims, and relative links describe upstream, not this fork. Consult the fork's [README](../README.md) for local setup and current status.

The intended fork lives under the user's authenticated GitHub account. M0 begins as a local checkout with an `upstream` remote. Creating the remote fork, configuring `origin`, and pushing the baseline require the user's M0 review approval. Do not imply that a remote repository exists before creation succeeds.

## Contribution boundaries

Dossier provides the existing Next.js application, structured profile, resume themes, job providers, startup discovery, job agent, document editing/history, tracking views, Gmail/Calendar features, provider adapters, and tests.

The approved V1 adaptation adds a profile-derived knowledge base, V5 selection and composition rules, subscription-authenticated Codex execution, sequential tailoring, verified local LaTeX output, repost-aware application history, submitted-document scoring, and local backup recovery. These are planned capabilities until their milestones pass review. Record actual implementation and verification in milestone reports rather than presenting the entire plan as delivered.

The existing V5 LaTeX master uses pdfLaTeX. SWE and Data are composition variants of the same formatting master. M2 will import reusable, parameterized template assets with their original MIT license and attribution, including Jake Gutierrez's template attribution. Never copy personal contact information, work history, historical application content, or absolute personal source paths into the public repository. Preserve the existing external masters unchanged.

## Updating upstream

Fetch upstream explicitly and review changes against the pinned baseline before integrating. Do not automatically replace this fork's runtime with the upstream container image or advertise upstream releases as fork upgrades. Keep the provenance of later upstream merges in Git and milestone notes.
