import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canViewRecordings } from "@/lib/recordings";

// Solo imágenes y PDF se muestran dentro del navegador; el resto se descarga.
const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, workspaceId: true, everyone: true, createdById: true } });
    const file = meeting ? await prisma.meetingFile.findFirst({ where: { id: fid, meetingId: id } }) : null;
    if (!meeting || !file || !(await canViewRecordings(auth.user, meeting))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (file.kind === "LINK" && file.url) return NextResponse.redirect(file.url, 307);
    const inline = INLINE.test(file.mimeType) && new URL(req.url).searchParams.get("download") !== "1";
    return new NextResponse(new Uint8Array(file.data) as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": inline ? file.mimeType : "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id }, select: { createdById: true } });
    const file = await prisma.meetingFile.findFirst({ where: { id: fid, meetingId: id }, select: { uploadedById: true } });
    if (!meeting || !file) return NextResponse.json({ ok: true });
    if (auth.user.role !== "LEAD" && file.uploadedById !== auth.user.id && meeting.createdById !== auth.user.id) return NextResponse.json({ error: "Solo quien lo subió, quien agendó la reunión o un líder puede borrarlo" }, { status: 403 });
    await prisma.meetingFile.delete({ where: { id: fid } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
