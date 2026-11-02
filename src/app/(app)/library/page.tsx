import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { ResumeLibrary } from "./resume-library";
import { TemplateSamples } from "./template-samples";

export const metadata = { title: "Resume library" };
export default async function LibraryPage() {
  const assets = await prisma.resumeAsset.findMany({ select: { id: true, name: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return <><PageHeader title="Resume library" description="Historical resumes and references, kept locally. Uploads never change your validated KB." />
    <div className="px-10 pb-12 space-y-6"><Link className="underline" href="/knowledge">Knowledge base and tailoring preferences →</Link>
      <TemplateSamples /><ResumeLibrary assets={assets.map(a => ({ ...a, createdAt: a.createdAt.toISOString() }))} /></div></>;
}
