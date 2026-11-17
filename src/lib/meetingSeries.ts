import "server-only";
import type { MeetingSeries } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { announceMeeting, type CreateMeetingInput } from "@/lib/meetings";
import { dayKey, zonedParts, zonedToUtc } from "@/lib/scrum/countries";
import { addDays, describeRule, occurrenceDates, type Freq, type RepeatRule } from "@/lib/scrum/recurrence";

// Reuniones recurrentes. Cada fecha de la serie es una reunión normal (se crean por adelantado, unas 13 semanas, y el
// servidor agrega más con el tiempo). Así las grabaciones, los archivos, las notas y los avisos funcionan igual que siempre.

export const HORIZON_DAYS = 90;
const TOPUP_MARGIN_DAYS = 30;
const DAY = 86_400_000;

const list = <T>(raw: string): T[] => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
};

export const seriesRule = (s: Pick<MeetingSeries, "freq" | "interval" | "weekdays" | "until" | "count">): RepeatRule => ({ freq: s.freq as Freq, interval: s.interval, weekdays: list<number>(s.weekdays), until: s.until, count: s.count });
export const seriesLabel = (s: Pick<MeetingSeries, "freq" | "interval" | "weekdays" | "until" | "count" | "startDate">) => describeRule(s.startDate, seriesRule(s));

// "HH:mm" en la zona (con las 24:00 del Intl convertidas a 00:00).
export function hhmmIn(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${String(p.hour % 24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function startsAtOf(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return zonedToUtc(y, m, d, h, mi, tz);
}

// Primera fecha desde la que se crean/actualizan reuniones: desde ayer (para no perder la de hoy a primera hora).
const createFromOf = (now: Date, tz: string) => dayKey(new Date(now.getTime() - 12 * 3_600_000), tz);

type Reconcile = { created: number; updated: number; removed: number };

// Deja las reuniones de la serie como manda su regla. Crea las que faltan hasta el horizonte; con `updateExisting` también
// pone al día las que no se tocaron una a una y quita (o suelta, si tienen grabaciones o archivos) las que la regla ya no incluye.
export async function materializeSeries(seriesId: string, now: Date = new Date(), opts: { updateExisting?: boolean } = {}): Promise<Reconcile> {
  const s = await prisma.meetingSeries.findUnique({ where: { id: seriesId } });
  const out: Reconcile = { created: 0, updated: 0, removed: 0 };
  if (!s) return out;
  const horizon = dayKey(new Date(now.getTime() + HORIZON_DAYS * DAY), s.tz);
  const createFrom = createFromOf(now, s.tz);
  const desired = occurrenceDates(s.startDate, seriesRule(s), { to: horizon, skip: list<string>(s.skipDates) });
  const desiredSet = new Set(desired);
  const existing = await prisma.meeting.findMany({ where: { seriesId }, select: { id: true, occurrenceDate: true, seriesException: true, startsAt: true, _count: { select: { recordings: true, files: true } } } });
  const byDate = new Map(existing.filter((m) => m.occurrenceDate).map((m) => [m.occurrenceDate!, m]));
  const userIds = list<string>(s.userIds);
  const durationMs = s.durationMin * 60_000;
  const fields = (date: string) => {
    const startsAt = startsAtOf(date, s.startTime, s.tz);
    return { title: s.title, description: s.description, meetUrl: s.meetUrl, projectId: s.projectId, everyone: s.everyone, startsAt, endsAt: new Date(startsAt.getTime() + durationMs) };
  };

  for (const date of desired) {
    if (date < createFrom) continue;
    const row = byDate.get(date);
    if (!row) {
      await prisma.meeting.create({
        data: { ...fields(date), workspaceId: s.workspaceId, createdById: s.createdById, seriesId, occurrenceDate: date, attendees: { create: s.everyone ? [] : userIds.map((userId) => ({ userId })) } },
      });
      out.created++;
    } else if (opts.updateExisting && !row.seriesException) {
      const f = fields(date);
      await prisma.$transaction([
        prisma.meeting.update({ where: { id: row.id }, data: { ...f, ...(f.startsAt.getTime() !== row.startsAt.getTime() ? { reminderSentAt: null } : {}) } }),
        prisma.meetingAttendee.deleteMany({ where: { meetingId: row.id } }),
        ...(s.everyone ? [] : [prisma.meetingAttendee.createMany({ data: userIds.map((userId) => ({ meetingId: row.id, userId })) })]),
      ]);
      out.updated++;
    }
  }

  if (opts.updateExisting) {
    for (const row of existing) {
      if (!row.occurrenceDate || row.seriesException || row.occurrenceDate < createFrom || desiredSet.has(row.occurrenceDate)) continue;
      // La regla ya no la incluye: se borra, salvo que tenga grabaciones o archivos (entonces queda suelta, sin serie).
      if (row._count.recordings === 0 && row._count.files === 0) await prisma.meeting.delete({ where: { id: row.id } });
      else await prisma.meeting.update({ where: { id: row.id }, data: { seriesId: null, occurrenceDate: null, seriesException: false } });
      out.removed++;
    }
  }
  await prisma.meetingSeries.update({ where: { id: seriesId }, data: { generatedThrough: horizon } });
  return out;
}

// Mantiene al día el horizonte de todas las series (el temporizador del servidor lo llama cada hora).
export async function topUpSeries(now: Date = new Date()): Promise<number> {
  const limit = dayKey(new Date(now.getTime() + (HORIZON_DAYS - TOPUP_MARGIN_DAYS) * DAY), "UTC");
  const due = await prisma.meetingSeries.findMany({
    where: { OR: [{ generatedThrough: null }, { generatedThrough: { lt: limit } }] },
    select: { id: true, until: true, generatedThrough: true },
    take: 200,
  });
  let n = 0;
  for (const s of due) {
    if (s.until && s.generatedThrough && s.generatedThrough >= s.until) continue; // ya está completa
    const r = await materializeSeries(s.id, now);
    n += r.created;
  }
  return n;
}

export type CreateSeriesInput = CreateMeetingInput & { rule: RepeatRule; tz: string };

// Crea la serie con sus reuniones y la anuncia UNA vez (chat y aviso a los invitados).
export async function createSeries(input: CreateSeriesInput) {
  const duration = Math.min(Math.max(input.durationMin ?? 60, 5), 12 * 60);
  const everyone = input.everyone !== false;
  const team = new Set((await membersOf(input.workspaceId)).map((m) => m.id));
  const userIds = everyone ? [] : [...new Set(input.userIds ?? [])].filter((id) => team.has(id) && id !== input.creator.id);
  const project = input.projectId ? await prisma.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } }) : null;
  const startDate = dayKey(input.startsAt, input.tz);
  const series = await prisma.meetingSeries.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.creator.id,
      freq: input.rule.freq,
      interval: input.rule.interval,
      weekdays: JSON.stringify(input.rule.weekdays),
      startDate,
      startTime: hhmmIn(input.startsAt, input.tz),
      tz: input.tz,
      durationMin: duration,
      until: input.rule.until,
      count: input.rule.count,
      title: input.title.slice(0, 200),
      description: input.description ?? "",
      meetUrl: input.meetUrl || null,
      everyone,
      userIds: JSON.stringify(userIds),
      projectId: project?.id ?? null,
    },
  });
  await materializeSeries(series.id);
  const first = await prisma.meeting.findFirst({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
  if (!first) throw new Error("No se pudo crear la primera reunión de la serie");
  await announceMeeting(first, { creator: input.creator, title: input.title, startsAt: first.startsAt, post: input.post, notify: input.notify }, project?.id ?? null, seriesLabel(series));
  return { series, first };
}

export type SeriesPatch = {
  title?: string;
  description?: string;
  meetUrl?: string | null;
  projectId?: string | null;
  everyone?: boolean;
  userIds?: string[]; // ya filtrados al equipo
  durationMin?: number;
  startsAt?: Date; // la hora (y, en «esta y las siguientes», la fecha) que se eligió para la reunión editada
};

type Occurrence = { id: string; seriesId: string | null; occurrenceDate: string | null; workspaceId: string };

const applyPatch = (patch: SeriesPatch, tz: string, creatorId?: string): Partial<Pick<MeetingSeries, "title" | "description" | "meetUrl" | "projectId" | "everyone" | "userIds" | "durationMin" | "startTime">> => ({
  ...(patch.title !== undefined ? { title: patch.title } : {}),
  ...(patch.description !== undefined ? { description: patch.description } : {}),
  ...(patch.meetUrl !== undefined ? { meetUrl: patch.meetUrl || null } : {}),
  ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
  ...(patch.everyone !== undefined ? { everyone: patch.everyone } : {}),
  ...(patch.userIds !== undefined ? { userIds: JSON.stringify(patch.userIds.filter((u) => u !== creatorId)) } : {}),
  ...(patch.durationMin !== undefined ? { durationMin: patch.durationMin } : {}),
  ...(patch.startsAt ? { startTime: hhmmIn(patch.startsAt, tz) } : {}),
});

// Cambia TODA la serie (las reuniones que no se tocaron una a una) o «esta y las siguientes».
// Devuelve el id de la reunión editada (puede cambiar si la regla ya no la incluye).
export async function editSeries(m: Occurrence, scope: "following" | "all", patch: SeriesPatch, repeat: RepeatRule | null, tz: string, now: Date = new Date()): Promise<string | null> {
  const series = await prisma.meetingSeries.findUnique({ where: { id: m.seriesId! } });
  if (!series || !m.occurrenceDate) return m.id;

  if (scope === "all" || m.occurrenceDate <= series.startDate) {
    // Toda la serie: la hora del día se toma en la zona de la serie; la fecha de esta reunión no mueve a las demás.
    await prisma.meetingSeries.update({
      where: { id: series.id },
      data: {
        ...applyPatch(patch, series.tz, series.createdById ?? undefined),
        ...(repeat ? { freq: repeat.freq, interval: repeat.interval, weekdays: JSON.stringify(repeat.weekdays), until: repeat.until, count: repeat.count } : {}),
      },
    });
    await materializeSeries(series.id, now, { updateExisting: true });
    return (await prisma.meeting.findUnique({ where: { id: m.id }, select: { id: true } }))?.id ?? null;
  }

  // «Esta y las siguientes»: la serie vieja termina el día anterior y nace una nueva desde esta fecha.
  const D = m.occurrenceDate;
  const oldRule = seriesRule(series);
  const before = occurrenceDates(series.startDate, { ...oldRule, count: null, until: null }, { to: addDays(D, -1) });
  const beforeCount = before.length;
  const newStartDate = patch.startsAt ? dayKey(patch.startsAt, tz) : D;
  const newTz = patch.startsAt ? tz : series.tz;
  const baseRule = repeat ?? oldRule;
  const remaining = baseRule.count !== null && !repeat ? Math.max(1, baseRule.count - beforeCount) : baseRule.count;
  const moved = list<string>(series.skipDates).filter((d) => d >= D);

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.meetingSeries.create({
      data: {
        workspaceId: series.workspaceId,
        createdById: series.createdById,
        freq: baseRule.freq,
        interval: baseRule.interval,
        weekdays: JSON.stringify(baseRule.weekdays),
        until: baseRule.until,
        count: remaining,
        startDate: newStartDate,
        startTime: patch.startsAt ? hhmmIn(patch.startsAt, tz) : series.startTime,
        tz: newTz,
        durationMin: series.durationMin,
        skipDates: JSON.stringify(moved),
        title: series.title,
        description: series.description,
        meetUrl: series.meetUrl,
        everyone: series.everyone,
        userIds: series.userIds,
        projectId: series.projectId,
        ...applyPatch({ ...patch, startsAt: undefined }, tz, series.createdById ?? undefined),
      },
    });
    await tx.meetingSeries.update({ where: { id: series.id }, data: { until: addDays(D, -1), count: null } });
    // Las reuniones de la serie vieja desde esta fecha: esta pasa a la nueva; las que no se tocaron se borran (la nueva las
    // vuelve a crear); las que tienen grabaciones, archivos o cambios propios quedan sueltas.
    const later = await tx.meeting.findMany({ where: { seriesId: series.id, occurrenceDate: { gte: D } }, select: { id: true, seriesException: true, _count: { select: { recordings: true, files: true } } } });
    for (const r of later) {
      if (r.id === m.id) await tx.meeting.update({ where: { id: r.id }, data: { seriesId: next.id, occurrenceDate: newStartDate, seriesException: false } });
      else if (!r.seriesException && r._count.recordings === 0 && r._count.files === 0) await tx.meeting.delete({ where: { id: r.id } });
      else await tx.meeting.update({ where: { id: r.id }, data: { seriesId: null, occurrenceDate: null } });
    }
    return next;
  }, { timeout: 60_000 });
  await materializeSeries(created.id, now, { updateExisting: true });
  return (await prisma.meeting.findUnique({ where: { id: m.id }, select: { id: true } }))?.id ?? null;
}

// Cancela «esta y las siguientes» (o toda la serie desde hoy): quedan canceladas en el calendario y la serie termina antes.
export async function cancelSeries(m: Occurrence, scope: "following" | "all", now: Date = new Date()): Promise<number> {
  const series = await prisma.meetingSeries.findUnique({ where: { id: m.seriesId! } });
  if (!series) return 0;
  const from = scope === "all" ? (createFromOf(now, series.tz) > series.startDate ? createFromOf(now, series.tz) : series.startDate) : m.occurrenceDate ?? series.startDate;
  await prisma.meetingSeries.update({ where: { id: series.id }, data: { until: addDays(from, -1), count: null } });
  const res = await prisma.meeting.updateMany({ where: { seriesId: series.id, occurrenceDate: { gte: from }, status: "SCHEDULED" }, data: { status: "CANCELED", seriesException: true } });
  return res.count;
}

// Borra «esta» (la fecha queda fuera de la serie), «esta y las siguientes» o toda la serie. Lo que tiene grabaciones o
// archivos nunca se pierde: queda como reunión suelta.
export async function deleteFromSeries(m: Occurrence, scope: "one" | "following" | "all", now: Date = new Date()): Promise<void> {
  const series = await prisma.meetingSeries.findUnique({ where: { id: m.seriesId! } });
  if (!series) return void (await prisma.meeting.delete({ where: { id: m.id } }).catch(() => {}));
  if (scope === "one") {
    if (m.occurrenceDate) await prisma.meetingSeries.update({ where: { id: series.id }, data: { skipDates: JSON.stringify([...new Set([...list<string>(series.skipDates), m.occurrenceDate])]) } });
    await prisma.meeting.delete({ where: { id: m.id } });
    return;
  }
  const from = scope === "all" ? createFromOf(now, series.tz) : m.occurrenceDate ?? series.startDate;
  const later = await prisma.meeting.findMany({ where: { seriesId: series.id, occurrenceDate: { gte: from } }, select: { id: true, seriesException: true, _count: { select: { recordings: true, files: true } } } });
  for (const r of later) {
    if (r._count.recordings === 0 && r._count.files === 0) await prisma.meeting.delete({ where: { id: r.id } });
    else await prisma.meeting.update({ where: { id: r.id }, data: { seriesId: null, occurrenceDate: null, seriesException: false } });
  }
  if (scope === "all" || from <= series.startDate) await prisma.meetingSeries.delete({ where: { id: series.id } });
  else await prisma.meetingSeries.update({ where: { id: series.id }, data: { until: addDays(from, -1), count: null } });
}

// Convierte una reunión que ya existe en la primera de una serie (se le agrega repetición al editarla).
export async function makeRecurring(meetingId: string, rule: RepeatRule, tz: string, now: Date = new Date()): Promise<MeetingSeries> {
  const m = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: { attendees: { select: { userId: true } } } });
  const series = await prisma.meetingSeries.create({
    data: {
      workspaceId: m.workspaceId,
      createdById: m.createdById,
      freq: rule.freq,
      interval: rule.interval,
      weekdays: JSON.stringify(rule.weekdays),
      startDate: dayKey(m.startsAt, tz),
      startTime: hhmmIn(m.startsAt, tz),
      tz,
      durationMin: Math.max(5, Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000)),
      until: rule.until,
      count: rule.count,
      title: m.title,
      description: m.description,
      meetUrl: m.meetUrl,
      everyone: m.everyone,
      userIds: JSON.stringify(m.attendees.map((a) => a.userId)),
      projectId: m.projectId,
    },
  });
  await prisma.meeting.update({ where: { id: m.id }, data: { seriesId: series.id, occurrenceDate: series.startDate, seriesException: false } });
  await materializeSeries(series.id, now);
  return series;
}
