import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { membersOf } from "@/lib/workspace";
import { ensureChannels } from "@/lib/chatChannels";
import { describeRule } from "@/lib/scrum/recurrence";
import { DEFAULT_TZ, formatDay, formatTime, isValidTimeZone, offsetLabel, zoneName } from "@/lib/scrum/countries";

// Reuniones del equipo (calendario). La hora vive en UTC; cada persona la ve en su zona.

export type MeetingPerson = { id: string; name: string; tz: string };
export type MeetingDTO = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  meetUrl: string | null;
  status: "SCHEDULED" | "CANCELED";
  everyone: boolean;
  project: { id: string; name: string; key: string | null } | null;
  createdBy: { id: string; name: string } | null;
  attendees: MeetingPerson[]; // quiénes están invitados (si es "todo el equipo", todo el equipo)
  recordings: number;
  // Reunión recurrente: la regla (para el formulario) y su descripción ("Cada semana los lunes").
  series: { id: string; label: string; startDate: string; tz: string; rule: { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; weekdays: number[]; until: string | null; count: number | null } } | null;
  occurrenceDate: string | null;
  seriesException: boolean;
};

// Zona de cada persona: la de su perfil; si no, la de sus avisos; si no, la de Bolivia.
export async function zonesOf(userIds: string[]): Promise<Map<string, string>> {
  const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, timezone: true, notifPrefs: { select: { tz: true } } } });
  const out = new Map<string, string>();
  for (const u of rows) {
    const tz = u.timezone ?? u.notifPrefs?.tz ?? DEFAULT_TZ;
    out.set(u.id, isValidTimeZone(tz) ? tz : DEFAULT_TZ);
  }
  for (const id of userIds) if (!out.has(id)) out.set(id, DEFAULT_TZ);
  return out;
}

// La regla de una serie a partir de sus columnas (sin depender del servidor, para usarla también aquí).
function seriesRuleOf(s: { freq: string; interval: number; weekdays: string; until: string | null; count: number | null }): NonNullable<MeetingDTO["series"]>["rule"] {
  let weekdays: number[] = [];
  try {
    const v = JSON.parse(s.weekdays);
    if (Array.isArray(v)) weekdays = v.map(Number).filter((n) => Number.isInteger(n));
  } catch {}
  return { freq: s.freq as "DAILY" | "WEEKLY" | "MONTHLY", interval: s.interval, weekdays, until: s.until, count: s.count };
}

export const meetingInclude = {
  project: { select: { id: true, name: true, key: true } },
  createdBy: { select: { id: true, name: true } },
  attendees: { select: { userId: true } },
  series: { select: { id: true, freq: true, interval: true, weekdays: true, startDate: true, until: true, count: true, tz: true } },
  _count: { select: { recordings: true } },
} as const;

type Row = Awaited<ReturnType<typeof prisma.meeting.findFirstOrThrow<{ include: typeof meetingInclude }>>>;

export async function toMeetingDTOs(rows: Row[], workspaceId: string): Promise<MeetingDTO[]> {
  const team = await membersOf(workspaceId);
  const zones = await zonesOf(team.map((m) => m.id));
  const person = (id: string): MeetingPerson | null => {
    const m = team.find((x) => x.id === id);
    return m ? { id: m.id, name: m.name, tz: zones.get(id) ?? DEFAULT_TZ } : null;
  };
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    meetUrl: r.meetUrl,
    status: r.status === "CANCELED" ? "CANCELED" : "SCHEDULED",
    everyone: r.everyone,
    project: r.project,
    createdBy: r.createdBy,
    attendees: (r.everyone ? team.map((m) => m.id) : [...new Set([...r.attendees.map((a) => a.userId), ...(r.createdBy ? [r.createdBy.id] : [])])]).map(person).filter((p): p is MeetingPerson => !!p),
    recordings: r._count.recordings,
    series: r.series ? { id: r.series.id, label: describeRule(r.series.startDate, seriesRuleOf(r.series)), startDate: r.series.startDate, tz: r.series.tz, rule: seriesRuleOf(r.series) } : null,
    occurrenceDate: r.occurrenceDate,
    seriesException: r.seriesException,
  }));
}

export async function loadMeetings(workspaceId: string, range: { from: Date; to: Date }): Promise<MeetingDTO[]> {
  const rows = await prisma.meeting.findMany({ where: { workspaceId, startsAt: { gte: range.from, lt: range.to } }, orderBy: { startsAt: "asc" }, include: meetingInclude, take: 500 });
  return toMeetingDTOs(rows, workspaceId);
}

export async function loadMeeting(workspaceId: string, id: string): Promise<MeetingDTO | null> {
  const row = await prisma.meeting.findFirst({ where: { id, workspaceId }, include: meetingInclude });
  return row ? (await toMeetingDTOs([row], workspaceId))[0] : null;
}

// ¿Quién fue invitado? (todo el equipo, o los elegidos + quien la agendó)
export async function inviteesOf(meeting: { id: string; workspaceId: string; everyone: boolean; createdById: string | null }): Promise<string[]> {
  if (meeting.everyone) return (await membersOf(meeting.workspaceId)).map((m) => m.id);
  const rows = await prisma.meetingAttendee.findMany({ where: { meetingId: meeting.id }, select: { userId: true } });
  return [...new Set([...rows.map((r) => r.userId), ...(meeting.createdById ? [meeting.createdById] : [])])];
}

// "viernes 14 nov, 10:00 (Perú · UTC-5)": la hora de una reunión en una zona.
export function whenLabel(startsAt: Date, tz: string): string {
  return `${formatDay(startsAt, tz, { weekday: "long", day: "numeric", month: "long" })}, ${formatTime(startsAt, tz)} (${zoneName(tz)}, ${offsetLabel(startsAt, tz)})`;
}

// Avisa a las personas, cada una con la hora en SU zona (se agrupa por zona para no mandar un aviso por persona).
export async function notifyMeeting(meeting: { id: string; title: string; startsAt: Date; workspaceId: string }, userIds: string[], opts: { heading: string; body?: string; priority?: "default" | "high" | "urgent"; kind?: "REUNION" | "URGENT" | "HELP" }) {
  const zones = await zonesOf(userIds);
  const byZone = new Map<string, string[]>();
  for (const id of userIds) {
    const tz = zones.get(id) ?? DEFAULT_TZ;
    byZone.set(tz, [...(byZone.get(tz) ?? []), id]);
  }
  for (const [tz, ids] of byZone) {
    await notifyUsers(ids, {
      kind: opts.kind ?? "REUNION",
      title: `${opts.heading} · ${formatDay(meeting.startsAt, tz, { weekday: "short", day: "numeric", month: "short" })} ${formatTime(meeting.startsAt, tz)}`,
      body: `${meeting.title}${opts.body ? ` — ${opts.body}` : ""} (${zoneName(tz)})`.slice(0, 160),
      url: `/calendar?reunion=${meeting.id}`,
      priority: opts.priority ?? "high",
      workspaceId: meeting.workspaceId,
      groupKey: `meeting-${meeting.id}-${opts.heading}`,
    });
  }
}

export type CreateMeetingInput = {
  workspaceId: string;
  creator: { id: string; name: string };
  title: string;
  startsAt: Date;
  durationMin?: number;
  meetUrl?: string | null;
  description?: string;
  projectId?: string | null;
  everyone?: boolean;
  userIds?: string[];
  post?: { level?: "AYUDA" | "URGENTE" | null; channelId?: string | null } | false; // publicar en el chat (canal Reuniones)
  notify?: boolean;
};

// Anuncia una reunión recién creada: mensaje en el canal Reuniones del chat y aviso a los invitados con su hora local.
// Una reunión que ya pasó (se registra solo para guardar lo que se trató) no avisa a nadie. En una reunión recurrente se
// anuncia UNA vez (la primera fecha) y `label` describe la repetición ("Cada semana los lunes").
export async function announceMeeting(meeting: { id: string; title: string; startsAt: Date; workspaceId: string; everyone: boolean; createdById: string | null }, input: Pick<CreateMeetingInput, "creator" | "title" | "startsAt" | "post" | "notify">, projectId: string | null, label?: string) {
  const creatorZone = (await zonesOf([input.creator.id])).get(input.creator.id) ?? DEFAULT_TZ;
  const past = input.startsAt.getTime() < Date.now() - 10 * 60_000;
  const post = input.post === false || past ? null : input.post ?? {};
  if (post) {
    const channels = await ensureChannels(meeting.workspaceId);
    const target = (post.channelId ? channels.find((c) => c.id === post.channelId && c.kind === "REUNIONES") : undefined) ?? channels.find((c) => c.kind === "REUNIONES");
    await prisma.chatMessage.create({
      data: {
        workspaceId: meeting.workspaceId,
        authorId: input.creator.id,
        channelId: target?.id,
        announce: true,
        level: post.level ?? null,
        body: `${label ? "Reunión recurrente" : "Reunión"} · ${whenLabel(input.startsAt, creatorZone)}${label ? ` (${label.toLowerCase()})` : ""}: ${input.title} [[meeting:${meeting.id}]]`,
        refs: { create: [{ kind: "MEETING", targetId: meeting.id, projectId }] },
      },
    });
  }
  if (input.notify !== false && !past) {
    const invitees = (await inviteesOf(meeting)).filter((id) => id !== input.creator.id);
    await notifyMeeting(meeting, invitees, { heading: label ? "Nueva reunión recurrente" : "Nueva reunión", body: `agenda ${input.creator.name}${label ? ` · ${label}` : ""}`, priority: post?.level === "URGENTE" ? "urgent" : "high" });
  }
}

// Crea la reunión, la anuncia en el chat (canal Reuniones) y avisa a los invitados con su hora local.
export async function createMeeting(input: CreateMeetingInput) {
  const duration = Math.min(Math.max(input.durationMin ?? 60, 5), 12 * 60);
  const everyone = input.everyone !== false;
  const team = new Set((await membersOf(input.workspaceId)).map((m) => m.id));
  const chosen = everyone ? [] : [...new Set(input.userIds ?? [])].filter((id) => team.has(id) && id !== input.creator.id);
  const project = input.projectId ? await prisma.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } }) : null;
  const meeting = await prisma.meeting.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title.slice(0, 200),
      description: input.description ?? "",
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + duration * 60_000),
      meetUrl: input.meetUrl || null,
      everyone,
      projectId: project?.id ?? null,
      createdById: input.creator.id,
      attendees: { create: chosen.map((userId) => ({ userId })) },
    },
  });

  await announceMeeting(meeting, input, project?.id ?? null);
  return meeting;
}

// "Empieza en 15 minutos": se avisa una sola vez por reunión (se reclama con un UPDATE condicionado).
export const REMINDER_MINUTES = 15;
export async function flushMeetingReminders(now: Date = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
  const due = await prisma.meeting.findMany({ where: { status: "SCHEDULED", reminderSentAt: null, startsAt: { gt: new Date(now.getTime() - 5 * 60_000), lte: soon } }, select: { id: true, title: true, startsAt: true, workspaceId: true, everyone: true, createdById: true } });
  let sent = 0;
  for (const m of due) {
    const claimed = await prisma.meeting.updateMany({ where: { id: m.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) continue; // otra copia del servidor ya la avisó
    await notifyMeeting(m, await inviteesOf(m), { heading: `Empieza en ${REMINDER_MINUTES} min`, priority: "high" });
    sent++;
  }
  return sent;
}
