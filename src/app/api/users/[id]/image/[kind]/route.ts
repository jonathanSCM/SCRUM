import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { sharedWorkspaces } from "@/lib/workspace";

// Sirve la foto o el banner de una persona. Con ETag: el navegador pregunta cada vez
// pero solo descarga la imagen si cambió (así un cambio se ve al instante en toda la app).
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id, kind } = await params;
  const k = kind === "avatar" ? "AVATAR" : kind === "banner" ? "BANNER" : null;
  if (!k) return new NextResponse(null, { status: 404 });

  // Solo se ve la imagen de alguien con quien se comparte equipo (o la propia).
  if (id !== auth.user.id && (await sharedWorkspaces(auth.user.id, id)).length === 0) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=60" } });

  const meta = await prisma.userImage.findUnique({ where: { userId_kind: { userId: id, kind: k } }, select: { updatedAt: true } });
  if (!meta) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=60" } });

  const etag = `"${meta.updatedAt.getTime()}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });

  const img = await prisma.userImage.findUnique({ where: { userId_kind: { userId: id, kind: k } }, select: { data: true, mimeType: true } });
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mimeType, ETag: etag, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
