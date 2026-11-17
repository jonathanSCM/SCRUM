import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { inviteesOf, loadMeeting, notifyMeeting } from "@/lib/meetings";
import { cancelSeries, deleteFromSeries, editSeries, makeRecurring, seriesLabel } from "@/lib/meetingSeries";
import { dayKey, isValidTimeZone } from "@/lib/scrum/countries";
import { normalizeRule, type RepeatRule } from "@/lib/scrum/recurrence";
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
  description: z.string().trim().max(10000).optional(),
  projectId: z.string().min(1).max(40).nullish(),
  everyone: z.boolean().optional(),
  userIds: z.array(z.string().min(1).max(40)).max(100).optional(),
  canceled: z.boolean().optional(),
  // Reunión recurrente: a cuáles aplica el cambio y, si se cambia (o se agrega) la repetición, la regla.
  scope: z.enum(["one", "following", "all"]).default("one"),
  repeat: z.object({ freq: z.string(), interval: z.number().optional(), weekdays: z.array(z.number()).optional(), until: z.string().nullish(), count: z.number().nullish() }).nullish(),
  tz: z.string().max(64).optional(),
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
    const tz = d.tz && isValidTimeZone(d.tz) ? d.tz : null;
    const team = new Set((await membersOf(cur.workspaceId)).map((m) => m.id));
    let makeRule: RepeatRule | null = null;

    // ---- Reunión recurrente: cambios que valen para toda la serie o «esta y las siguientes» ----
    const scope = d.scope ?? "one";
    if (cur.seriesId && scope !== "one") {
      const series = await prisma.meetingSeries.findUnique({ where: { id: cur.seriesId } });
      if (!series) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      const occ = { id: cur.id, seriesId: cur.seriesId, occurrenceDate: cur.occurrenceDate, workspaceId: cur.workspaceId };
      const others = (await inviteesOf(cur)).filter((u) => u !== auth.user.id);
      if (d.canceled === true) {
        await cancelSeries(occ, scope);
        await notifyMeeting(cur, others, { heading: "Reunión recurrente cancelada", body: `la canceló ${auth.user.name} · ${seriesLabel(series)}` });
        return NextResponse.json(await loadMeeting(cur.workspaceId, id));
      }
      if (d.canceled === false) return NextResponse.json({ error: "Para reactivar una reunión recurrente, hazlo reunión por reunión" }, { status: 400 });
      let repeat = null;
      if (d.repeat) {
        const norm = normalizeRule(d.repeat, scope === "all" ? series.startDate : cur.occurrenceDate ?? series.startDate);
        if ("error" in norm) return NextResponse.json({ error: norm.error }, { status: 400 });
        repeat = norm.rule;
      }
      if ((d.startsAt || scope === "following") && !tz) return NextResponse.json({ error: "Falta la zona horaria de la reunión" }, { status: 400 });
      const newStart = d.startsAt ? new Date(d.startsAt) : undefined;
      const patch = {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.meetUrl !== undefined ? { meetUrl: d.meetUrl || null } : {}),
        ...(d.projectId !== undefined ? { projectId: d.projectId ? (await prisma.project.findFirst({ where: { id: d.projectId, workspaceId: cur.workspaceId }, select: { id: true } }))?.id ?? null : null } : {}),
        ...(d.everyone !== undefined ? { everyone: d.everyone } : {}),
        ...(d.userIds ? { userIds: [...new Set(d.userIds)].filter((u) => team.has(u)) } : {}),
        ...(d.durationMin !== undefined ? { durationMin: d.durationMin } : {}),
        ...(newStart ? { startsAt: newStart } : {}),
      };
      const newId = await editSeries(occ, scope, patch, repeat, tz ?? series.tz);
      const target = newId ?? (await prisma.meeting.findFirst({ where: { workspaceId: cur.workspaceId, startsAt: { gte: new Date() }, series: { createdById: series.createdById, title: patch.title ?? series.title } }, orderBy: { startsAt: "asc" }, select: { id: true } }))?.id;
      if (!target) return NextResponse.json({ error: "La serie ya no tiene reuniones próximas" }, { status: 404 });
      const after = await loadMeeting(cur.workspaceId, target);
      if (after && (repeat || (newStart && newStart.getTime() !== cur.startsAt.getTime()))) {
        await notifyMeeting({ id: target, title: after.title, startsAt: new Date(after.startsAt), workspaceId: cur.workspaceId }, others, { heading: "Reunión recurrente actualizada", body: `${auth.user.name} · ${after.series?.label ?? ""}` });
      }
      return NextResponse.json(after);
    }
    if (d.repeat && scope === "one" && cur.seriesId) return NextResponse.json({ error: "Para cambiar la repetición elige «Esta y las siguientes» o «Toda la serie»" }, { status: 400 });

    // ---- Reunión suelta a la que se le agrega repetición ----
    if (d.repeat && !cur.seriesId) {
      if (!tz) return NextResponse.json({ error: "Falta la zona horaria de la reunión" }, { status: 400 });
      const baseStart = d.startsAt ? new Date(d.startsAt) : cur.startsAt;
      if (baseStart.getTime() < Date.now() - 10 * 60_000) return NextResponse.json({ error: "Una reunión recurrente debe empezar hoy o más adelante" }, { status: 400 });
      const norm = normalizeRule(d.repeat, dayKey(baseStart, tz));
      if ("error" in norm) return NextResponse.json({ error: norm.error }, { status: 400 });
      // Primero se aplican los demás cambios a esta reunión y después pasa a ser la primera de la serie.
      makeRule = norm.rule;
    }

    const startsAt = d.startsAt ? new Date(d.startsAt) : cur.startsAt;
    const duration = d.durationMin ?? Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60000);
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
        // Una reunión de una serie que se cambia sola deja de seguir a la serie en lo que se le cambió.
        ...(cur.seriesId ? { seriesException: true } : {}),
      },
    });
    if (d.userIds) {
      const chosen = [...new Set(d.userIds)].filter((u) => team.has(u));
      await prisma.$transaction([prisma.meetingAttendee.deleteMany({ where: { meetingId: id } }), prisma.meetingAttendee.createMany({ data: chosen.map((userId) => ({ meetingId: id, userId })) })]);
    }
    if (makeRule && tz) {
      const made = await makeRecurring(updated.id, makeRule, tz);
      const others = (await inviteesOf(updated)).filter((u) => u !== auth.user.id);
      await notifyMeeting(updated, others, { heading: "Ahora es una reunión recurrente", body: `${auth.user.name} · ${seriesLabel(made)}` });
    }
    const invitees = (await inviteesOf(updated)).filter((u) => u !== auth.user.id);
    if (d.canceled === true && cur.status !== "CANCELED") await notifyMeeting(updated, invitees, { heading: "Reunión cancelada", body: `la canceló ${auth.user.name}` });
    else if (timeChanged) await notifyMeeting(updated, invitees, { heading: "Reunión reprogramada", body: `la movió ${auth.user.name}` });
    return NextResponse.json(await loadMeeting(cur.workspaceId, id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const cur = await prisma.meeting.findUnique({ where: { id }, select: { createdById: true, seriesId: true, occurrenceDate: true, workspaceId: true } });
    if (!cur) return NextResponse.json({ ok: true });
    if (cur.createdById !== auth.user.id && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo quien la agendó o un líder puede borrarla" }, { status: 403 });
    const scope = ["one", "following", "all"].includes(new URL(req.url).searchParams.get("scope") ?? "") ? (new URL(req.url).searchParams.get("scope") as "one" | "following" | "all") : "one";
    if (cur.seriesId) await deleteFromSeries({ id, seriesId: cur.seriesId, occurrenceDate: cur.occurrenceDate, workspaceId: cur.workspaceId }, scope);
    else await prisma.meeting.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
