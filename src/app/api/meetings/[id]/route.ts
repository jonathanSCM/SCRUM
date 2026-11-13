import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { inviteesOf, loadMeeting, notifyMeeting } from "@/lib/meetings";
import { membersOf } from "@/lib/workspace";
import { parseBody, readJson } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const m = await loadMeeting(auth.user.workspaceId!, id);
    return m ? NextResponse.json(m, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  startsAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(5).max(720).optional(),
  meetUrl: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "El enlace debe empezar con https://").nullish(),
  description: z.string().trim().max(2000).optional(),
  projectId: z.string().min(1).max(40).nullish(),
  everyone: z.boolean().optional(),
  userIds: z.array(z.string().min(1).max(40)).max(100).optional(),
  canceled: z.boolean().optional(),
});

// Editar o cancelar: quien la agendó o un líder. Los invitados reciben un aviso con la hora nueva (en su zona).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(patchSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const cur = await prisma.meeting.findUnique({ where: { id } });
    if (!cur) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (cur.createdById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien la agendó o un líder puede cambiarla" }, { status: 403 });
    if (d.everyone === true && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo un líder puede invitar a todo el equipo" }, { status: 403 });
    const startsAt = d.startsAt ? new Date(d.startsAt) : cur.startsAt;
    const duration = d.durationMin ?? Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60000);
    const team = new Set((await membersOf(cur.workspaceId)).map((m) => m.id));
    const project = d.projectId ? await prisma.project.findFirst({ where: { id: d.projectId, workspaceId: cur.workspaceId }, select: { id: true } }) : null;
    const timeChanged = !!d.startsAt && startsAt.getTime() !== cur.startsAt.getTime();
    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.meetUrl !== undefined ? { meetUrl: d.meetUrl || null } : {}),
        ...(d.projectId !== undefined ? { projectId: project?.id ?? null } : {}),
        ...(d.everyone !== undefined ? { everyone: d.everyone } : {}),
        ...(d.startsAt || d.durationMin ? { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000) } : {}),
        ...(timeChanged ? { reminderSentAt: null } : {}),
        ...(d.canceled !== undefined ? { status: d.canceled ? "CANCELED" : "SCHEDULED" } : {}),
      },
    });
    if (d.userIds) {
      const chosen = [...new Set(d.userIds)].filter((u) => team.has(u));
      await prisma.$transaction([prisma.meetingAttendee.deleteMany({ where: { meetingId: id } }), prisma.meetingAttendee.createMany({ data: chosen.map((userId) => ({ meetingId: id, userId })) })]);
    }
    const invitees = (await inviteesOf(updated)).filter((u) => u !== auth.user.id);
    if (d.canceled === true && cur.status !== "CANCELED") await notifyMeeting(updated, invitees, { heading: "Reunión cancelada", body: `la canceló ${auth.user.name}` });
    else if (timeChanged) await notifyMeeting(updated, invitees, { heading: "Reunión reprogramada", body: `la movió ${auth.user.name}` });
    return NextResponse.json(await loadMeeting(cur.workspaceId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const cur = await prisma.meeting.findUnique({ where: { id }, select: { createdById: true } });
    if (!cur) return NextResponse.json({ ok: true });
    if (cur.createdById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien la agendó o un líder puede borrarla" }, { status: 403 });
    await prisma.meeting.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
