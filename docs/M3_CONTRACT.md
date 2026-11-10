# M3 implementation contract

M2 approved and pushed November 3, 2026 (`e998bdf`). M3 is in progress; no M3 push before review approval.

## Data and boundaries

Coordinator owns Prisma and this contract. New tables isolate discovery from legacy application/draft records:

- `DiscoveryControl` singleton `discovery`: JSON configuration, nextTickAt, sessionUntil, updatedAt. Configuration uses the schema in `src/lib/discovery/contracts.ts`.
- `DiscoveryScan`: durable QUEUED/RUNNING/COMPLETED/FAILED/INTERRUPTED status; manual flag; owner, leaseUntil, stage; sourceResults JSON; error; createdAt, finishedAt. Claim under a PostgreSQL advisory transaction lock, renew lease, fence writes by owner. One queued/running scan globally. Expired scan becomes INTERRUPTED; no missed-tick replay. No application or document writes.
- `DiscoveryPosting`: id; identityKey (canonical source identity/link); occurrenceKey unique; source/externalId/url; company/role; complete original JD; complete flag; postingEvidence JSON; postedAt; firstSeenAt/lastSeenAt; sightings; extracted JSON; coverage JSON; kbSnapshotId; state NEW/SAVED/DISMISSED; analysisError. Repeated sightings update observation data, not original evidence. Absolute changed posting date permits a new occurrence. Relative evidence is anchored to observation time with uncertainty; overlapping inferred date ranges are the same occurrence. No date evidence means no speculative repost.
- `TailoringSelection`: id, postingId unique FK, createdAt. Only explicit user actions insert; these are waiting selections for M4, not running jobs or application attempts. Incomplete JD or failed analysis cannot be selected.

## Public server functions (workflow owner)

`src/lib/discovery/service.ts` exports:
- `loadDiscovery(): Promise<DiscoveryView>` (serializable view defined in contracts)
- `saveDiscoveryConfig(config: DiscoveryConfig): Promise<void>`
- `startDiscoverySession(hours: 1|2|3): Promise<void>`; `stopDiscoverySession(): Promise<void>`
- `requestDiscoveryScan(): Promise<void>` (queue a manual scan, reuse active)
- `retryDiscoveryScan(id: string): Promise<void>` (explicit retry of a failed/interrupted scan with persisted input, config, full KB snapshot and checkpoint)
- `intakePosting(input: IntakeInput): Promise<void>` (URL or full pasted JD; durable processing with honest errors)
- `setDiscoveryState(ids: string[], state: PostingState): Promise<void>`
- `selectForTailoring(ids: string[]): Promise<void>`; `removeTailoringSelection(id: string): Promise<void>`

`src/lib/discovery/scheduler.ts` exports `startDiscoverySchedule()` for instrumentation. Startup has scheduling off unless explicitly enabled. Quick sessions OR weekly windows allow interval scans; expiry disallows new quick-session scans. Manual scan remains explicit. Schedule advances from current time, never loops missed intervals. Timezone uses IANA names; client initializes browser default only on unsaved configuration.

## Analysis/source functions (analysis owner)

`src/lib/discovery/analysis.ts`: `analyzePosting(posting: DiscoveryInput, kb: unknown, config: DiscoveryConfig, signal: AbortSignal): Promise<DiscoveryAnalysis>` using complete KB, no silent truncation. Default provider codex, explicit configured provider option; no fallback. Derive weighted score in code from validated requirement evidence (must-have=2, preference=1; direct=1, partial=.5, absent=0), with keyword coverage separately. Verify quoted KB evidence and JD requirements against supplied context; report unsupported results as errors. Dates/unknown values retain source evidence.

`src/lib/discovery/sources.ts`: `collectDiscovery(config: DiscoveryConfig, preferences: DiscoveryPreferences, signal: AbortSignal): Promise<{postings: DiscoveryInput[]; sources: SourceResult[]}>`. Reuse JSearch, YC, HN, bypass stale search cache for a new scan; per-source failure isolation. User removed Adzuna/German options. Fetch complete text using guarded existing URL fetch; incomplete remains flagged. No invented fields. Flexible role matching informed by preferences, no silent hardcoded title restriction.

Product owner: new `/discovery` page/actions/components/tests, navigation link, old `/agent` page redirect to discovery and settings agent section replacement link. Authenticated actions delegate to service. Show configuration, source outcomes, intake, findings, complete JD, extracted unknowns, KB coverage/gaps distinct from resume score, saved/dismissed, bulk/single explicit selection and waiting list. No claims that M4 tailoring executes yet.

Workflow owner: new service/store/scheduler/identity modules and tests only. Analysis owner: analysis/sources modules and tests, worker Codex task extension and tests (fixed discovery operation only). Coordinator: shared contracts/schema, instrumentation integration, disabling legacy autodraft, integration checks and review documentation. No agent changes another owner's files without coordination.
