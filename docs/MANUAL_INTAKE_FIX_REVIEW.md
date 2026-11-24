# Manual posting intake fix

November 24, 2026 — approved for commit and push on November 24, 2026.

The discovery pause controls accidentally disabled manual URL/JD intake. New application also displayed the whole discovery screen, making the manual flow difficult to find.

Changes:
- New application opens directly to a manual posting form and its results.
- Fetch posting retrieves a public URL into an editable JD preview. It preserves input on failure, does not start model analysis, and cannot overwrite existing JD text without clearing it first.
- Analyze posting remains available while board discovery is paused. The durable queue can claim explicit posting intake without unpausing scheduled searches; ordinary queued board searches remain paused.
- A paused queued board search that occupies the single scan slot now gives an actionable cancellation message instead of telling the user to wait indefinitely.
- Incomplete legacy search snippets are no longer prefilled as complete JDs.

Verification: 41 focused unit/database tests passed; TypeScript and targeted lint passed. All 3 browser checks and production app/worker builds passed. A live public posting fetch loaded 6,256 characters into the editable preview while manual analysis remained enabled. Public fetch still applies existing SSRF guards, time/size limits and authentication. Sites that require browser login or block public requests require pasted JD text.

Independent review covered manual claim semantics, input preservation, authentication and fetch guards. No application submission is performed.
