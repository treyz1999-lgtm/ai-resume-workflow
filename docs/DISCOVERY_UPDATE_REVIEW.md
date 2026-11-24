# Discovery controls and V5 search review

Approved for commit and push on November 24, 2026.

## Behavior

- Find jobs and New application now enter the same discovery/V5 workflow. Legacy JSearch history remains available through `/jobs?legacy=1`; the old document wizard remains explicitly accessible through `/new?legacy=1`.
- Pause persists across reloads/restarts and prevents new claims while allowing the current scan to finish. Resume restores the saved schedule. Stop now pauses scheduling, ends the quick session and cancels queued/running scans without deleting findings. Individual scans can be cancelled and retried from their saved checkpoint.
- Cancellation revokes database ownership immediately and aborts model requests on the next one-second heartbeat. A public posting fetch already in progress can take up to its existing ten-second timeout to return; cancelled workers cannot publish results.
- V5 web search uses ChatGPT-authenticated Codex live web search for public LinkedIn, Indeed, HiringCafe, Glassdoor, Handshake and Greenhouse results. It does not use desktop browser sessions or submit applications. Other providers retain JSearch, YC, HN and pasted-JD intake; this optional live-web source currently requires Codex.
- Actual web-tool activity is required. Candidate URLs are bounded and fetched independently through the existing SSRF-protected public fetcher. Unstructured pages remain incomplete and cannot enter tailoring. Source failures are isolated. Board reports are model-reported coverage, not proof of exhaustive board access.
- Experience preferences include early career, maximum required years, unknown-experience handling and excluded locations. Early career defaults to two years and rejects explicit senior/lead titles. Structured filtering is conservative: unfamiliar experience wording can remain unknown. Preferred experience does not automatically become required experience.
- Arizona/California abbreviations and nationwide US matching are supported. Tucson exclusions include nearby metro communities. Free-text preferences remain intact and guide web search; they are not an arbitrary deterministic policy engine.
- Automatic findings failing filters are dismissed; manually pasted roles remain user-controlled. Cached findings are rechecked when rediscovered. Saved findings are not automatically removed.

## Verification

- Full Vitest/database suite: 1,941 passed; 29 environment-dependent tests skipped.
- TypeScript and targeted ESLint passed.
- Production app and worker builds passed. Next.js build emits existing missing-runtime-environment messages during dynamic-page probing; build exits successfully and runtime health checks pass.
- Three Playwright checks passed: authentication, pasted JD through analysis/save/explicit tailoring selection, and primary routes with persistent pause/resume/stop controls.
- Live ChatGPT-authenticated Codex search returned public role URLs and observed web-search tool activity. Initial live check uncovered unsupported `format: uri` in the JSON schema; fixed while preserving local URL validation and added a regression assertion.
- Independent development agents reviewed cancellation, web transport and experience behavior. Corrected cached-filter bypass, experience alternative parsing, posting-date preservation, and aggregate source failure reporting.
- Application backup made before runtime update. Personal preference edits and browser screenshots are ignored under `private/`.

## Review instructions

Open `/discovery`, inspect Pause/Resume and Stop now, choose sources and use Scan now or a bounded session. Discovery is left paused for review. Early-career settings can be changed in Knowledge base → Discovery preferences. No application submissions or outbound mail were performed. The user approved publishing this update after local review.
