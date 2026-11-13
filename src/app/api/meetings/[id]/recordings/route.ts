import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canViewRecordings } from "@/lib/recordings";
import { openaiKeyFor } from "@/lib/teamIntegrations";

// Grabaciones y transcripciones de una reunión. Solo las ven los invitados, quien la agendó, quien grabó y los líderes.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, workspaceId: true, everyone: true, createdById: true } });
    if (!meeting) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const rows = await prisma.meetingRecording.findMany({ where: { meetingId: id }, orderBy: { createdAt: "asc" }, include: { recordedBy: { select: { id: true, name: true } }, parts: { select: { status: true } } } });
    // Partes de audio que todavía se conservan (sin cargar el audio en memoria).
    const audioParts = await prisma.audioPart.findMany({ where: { recordingId: { in: rows.map((r) => r.id) }, data: { not: null } }, orderBy: { part: "asc" }, select: { recordingId: true, part: true, size: true } });
    const visible = [];
    let hidden = 0;
    for (const r of rows) {
      if (await canViewRecordings(auth.user, meeting, r)) visible.push(r);
      else hidden++;
    }
    return NextResponse.json(
      {
        hidden,
        transcriptionConfigured: !!(await openaiKeyFor(meeting.workspaceId)),
        recordings: visible.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          error: r.error,
          startedAt: r.startedAt?.toISOString() ?? r.createdAt.toISOString(),
          recordedBy: r.recordedBy,
          captions: r.captions,
          transcript: r.transcript,
          audio: audioParts.filter((a) => a.recordingId === r.id).map((a) => ({ part: a.part, size: a.size })),
          parts: { total: r.parts.length, done: r.parts.filter((p) => p.status === "DONE").length, failed: r.parts.filter((p) => p.status === "FAILED").length },
          canManage: auth.user.role === "LEAD" || r.recordedBy?.id === auth.user.id,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
