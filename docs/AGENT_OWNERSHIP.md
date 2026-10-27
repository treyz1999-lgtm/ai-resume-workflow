# Build-agent ownership

Use one coordinator and up to three build agents. These development agents are separate from the agents the application eventually executes.

| Role | Responsibility |
| --- | --- |
| Coordinator/integrator | Shared contracts, database schema/migrations, integration, acceptance, Git operations, and user review |
| Workflow | Provider adapters, Codex runtime, discovery scheduling, queue, and V5 orchestration |
| Product | Profile/KB, libraries, discovery, queue/review UI, tracker, and dashboard |
| Verification/infrastructure | Docker, LaTeX/PDF tooling, verification, backups, and integration tests |

Before parallel edits, the coordinator establishes shared contracts and assigns disjoint files. Only the coordinator changes shared schemas/migrations. Use isolated worktrees for concurrent implementation; workers report their commits, changes, checks, and limitations for integration. Do not overwrite another worker's changes or change files outside assigned ownership without coordination.

For M0, work is divided into privacy/update policy, Docker/local infrastructure, and documentation worktrees. The coordinator owns integration and the M0 review report. This temporary division does not authorize later-milestone work.

Reassign an agent to independently review changes it did not author before closing a milestone. A worker must not certify its own work as independent review. The coordinator verifies integrated behavior; passing isolated tests does not prove integration.

## Milestone handoff

Each milestone handoff includes:

1. The working capability and a reproducible demonstration.
2. Local diff and commit information, with ownership identified.
3. Commands/checks actually run and observed results.
4. Screenshots or sample artifacts when they help review.
5. Failures, limitations, and any pending acceptance criteria.

Stop after the milestone handoff. No push or next-milestone work until explicit user approval. Approval authorizes that milestone's push and continuation; the first approval also authorizes remote fork creation. Only the coordinator performs remote Git mutations. Local worker commits are allowed for review and integration.

No deployment, application submission, recruiter outreach, or real outbound email/calendar mutation is authorized by implementation or testing. Use fictional fixtures and separate explicit live integration checks.
