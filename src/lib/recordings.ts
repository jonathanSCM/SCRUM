import "server-only";
import { prisma } from "@/lib/prisma";
import { inviteesOf } from "@/lib/meetings";

// Grabaciones de Meet que sube la extensión: subtítulos + audio en partes. La transcripción la hace transcribe.ts.

export const MEET_CODE = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
export const meetCodeOf = (url: string | null | undefined) => url?.match(MEET_CODE)?.[1].toLowerCase() ?? null;

// ¿A qué reunión del calendario pertenece? El `meetingId` que eligió la persona; si no, la que tiene el mismo código de
// Meet y está cerca en el tiempo; si no hay, se crea una reunión suelta (solo la ve quien grabó y los líderes).
export async function meetingForRecording(i: { workspaceId: string; userId: string; meetingId?: string | null; meetUrl?: string | null; title?: string | null; startedAt?: Date | null }) {
  if (i.meetingId) {
    const m = await prisma.meeting.findFirst({ where: { id: i.meetingId, workspaceId: i.workspaceId }, select: { id: true } });
    if (m) return m.id;
  }
  const code = meetCodeOf(i.meetUrl);
  const now = i.startedAt ?? new Date();
  if (code) {
    const near = await prisma.meeting.findMany({ where: { workspaceId: i.workspaceId, status: "SCHEDULED", meetUrl: { contains: code }, startsAt: { gte: new Date(now.getTime() - 12 * 3600_000), lte: new Date(now.getTime() + 12 * 3600_000) } }, select: { id: true, startsAt: true } });
    near.sort((a, b) => Math.abs(a.startsAt.getTime() - now.getTime()) - Math.abs(b.startsAt.getTime() - now.getTime()));
    if (near[0]) return near[0].id;
  }
  const created = await prisma.meeting.create({
    data: { workspaceId: i.workspaceId, title: (i.title?.trim() || "Reunión de Meet").slice(0, 200), startsAt: now, endsAt: new Date(now.getTime() + 60 * 60_000), meetUrl: i.meetUrl?.slice(0, 300) || null, everyone: false, createdById: i.userId, reminderSentAt: now }, // ya está en curso: no avisa a nadie (ni "empieza en 15 min")
    select: { id: true },
  });
  return created.id;
}

// Crea (o encuentra) la grabación de esta persona por el id que genera la extensión: reintentos y partes no se duplican.
export async function recordingFor(i: { workspaceId: string; userId: string; externalId: string; meetUrl?: string | null; title?: string | null; meetingId?: string | null; startedAt?: Date | null }) {
  const found = await prisma.meetingRecording.findUnique({ where: { workspaceId_externalId: { workspaceId: i.workspaceId, externalId: i.externalId } } });
  if (found) {
    if (found.recordedById !== i.userId) return null; // el id lo creó otra persona: no se mezcla
    return found;
  }
  const meetingId = await meetingForRecording(i);
  try {
    return await prisma.meetingRecording.create({ data: { workspaceId: i.workspaceId, externalId: i.externalId, meetingId, recordedById: i.userId, meetUrl: i.meetUrl?.slice(0, 300) || null, title: i.title?.slice(0, 200) || null, startedAt: i.startedAt ?? new Date() } });
  } catch {
    // Dos peticiones a la vez (partes de audio y subtítulos): la otra ganó, se usa esa.
    const again = await prisma.meetingRecording.findUnique({ where: { workspaceId_externalId: { workspaceId: i.workspaceId, externalId: i.externalId } } });
    return again && again.recordedById === i.userId ? again : null;
  }
}

// Recalcula el estado y la transcripción completa de una grabación a partir de sus partes.
export async function refreshRecording(id: string) {
  const rec = await prisma.meetingRecording.findUnique({ where: { id }, include: { parts: { orderBy: { part: "asc" }, select: { id: true, part: true, status: true, text: true } } } });
  if (!rec) return;
  const parts = rec.parts;
  const working = parts.some((p) => p.status === "WORKING");
  const pending = parts.some((p) => p.status === "PENDING");
  const failed = parts.some((p) => p.status === "FAILED");
  const transcript = parts.filter((p) => p.status === "DONE" && p.text.trim()).map((p) => p.text.trim()).join("\n\n");
  let status = rec.status;
  if (working) status = "TRANSCRIBING";
  else if (pending) status = "PENDING";
  else if (failed) status = "FAILED";
  else if (rec.finalized) status = "DONE";
  else status = "RECEIVING";
  await prisma.meetingRecording.update({ where: { id }, data: { status, transcript, ...(status === "DONE" || status === "RECEIVING" ? { error: null } : {}) } });
}

// ¿Puede esta persona ver las transcripciones de esta reunión? Invitados, quien la agendó, quien grabó y los líderes.
export async function canViewRecordings(user: { id: string; role: "LEAD" | "MEMBER" }, meeting: { id: string; workspaceId: string; everyone: boolean; createdById: string | null }, recording?: { recordedById: string | null }): Promise<boolean> {
  if (user.role === "LEAD" || meeting.createdById === user.id || recording?.recordedById === user.id) return true;
  return (await inviteesOf(meeting)).includes(user.id);
}
