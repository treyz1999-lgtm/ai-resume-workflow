/** Upstream network services are intentionally unavailable in this fork.
 * This is a code policy, not an environment default: imported settings and
 * legacy actions must not enable requests to the original project's servers.
 */
export function upstreamServicesEnabled(): boolean {
  return false;
}
