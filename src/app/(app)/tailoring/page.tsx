import type { Metadata } from "next";
import { verifySession } from "@/lib/auth/session";
import { loadQueue } from "@/lib/tailoring/queue";
import { TailoringScreen } from "./tailoring-screen";

export const metadata: Metadata = { title: "Tailoring queue" };

export default async function TailoringPage() {
  await verifySession();
  return <TailoringScreen view={await loadQueue()} />;
}
