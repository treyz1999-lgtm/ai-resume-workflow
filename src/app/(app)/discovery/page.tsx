import type { Metadata } from "next";
import { verifySession } from "@/lib/auth/session";
import { loadDiscovery } from "@/lib/discovery/service";
import { DiscoveryScreen } from "./discovery-screen";

export const metadata: Metadata = { title: "Discovery" };
export default async function DiscoveryPage() {
  await verifySession();
  return <DiscoveryScreen view={await loadDiscovery()} />;
}
