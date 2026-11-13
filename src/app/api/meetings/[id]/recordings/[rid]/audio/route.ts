import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

// Borra el audio de una grabación (la transcripción y los subtítulos se conservan). Quien grabó o un líder.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const rec = await prisma.meetingRecording.findFirst({ where: { id: rid, meetingId: id }, select: { recordedById: true } });
    if (!rec) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (rec.recordedById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien grabó o un líder puede borrar el audio" }, { status: 403 });
    const res = await prisma.audioPart.updateMany({ where: { recordingId: rid, status: { in: ["DONE", "FAILED"] }, data: { not: null } }, data: { data: null } });
    return NextResponse.json({ ok: true, deleted: res.count });
  } catch (e) {
    return errorResponse(e);
  }
}
