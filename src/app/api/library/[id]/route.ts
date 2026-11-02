import { route } from "@/lib/route";
import { prisma } from "@/lib/prisma";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const asset = await prisma.resumeAsset.findUnique({ where: { id } });
  if (!asset) return new Response(null, { status: 404 });
  const preview = request.nextUrl.searchParams.has("preview");
  return new Response(preview ? new Uint8Array(asset.preview) : new Uint8Array(asset.data), { headers: {
    "Content-Type": preview ? "image/png" : "application/pdf",
    "Content-Disposition": preview ? "inline" : `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
});
