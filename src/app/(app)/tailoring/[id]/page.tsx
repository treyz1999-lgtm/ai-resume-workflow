import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/session";
import { loadDocumentReview } from "@/lib/tailoring/document-review";
import { ReviewScreen } from "./review-screen";

export const metadata: Metadata = { title: "Document review" };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  await verifySession();
  const data = await loadDocumentReview((await params).id);
  if (!data) notFound();
  const version = Number((await searchParams).version);
  const exists = version === data.generation || data.revisions.some(d => d.generation === version) || data.history.some(h => h.generation === version);
  return <ReviewScreen data={data} initialVersion={exists ? version : null} />;
}
