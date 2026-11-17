import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { createMeeting, loadMeetings, meetingInclude, toMeetingDTOs } from "@/lib/meetings";
import { createSeries } from "@/lib/meetingSeries";
import { dayKey, isValidTimeZone } from "@/lib/scrum/countries";
import { normalizeRule } from "@/lib/scrum/recurrence";
import { prisma } from "@/lib/prisma";
import { parseBody, readJson } from "@/lib/validation";

// Reuniones del equipo en un rango de fechas (calendario). ?from=<ISO>&to=<ISO>
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 120 * 86_400_000) return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  try {
    return NextResponse.json({ meetings: await loadMeetings(auth.user.workspaceId!, { from, to }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Falta el título").max(200),
  startsAt: z.string().datetime({ message: "Fecha inválida" }),
  durationMin: z.number().int().min(5).max(720).default(60),
  meetUrl: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "El enlace debe empezar con https://").optional(),
  description: z.string().trim().max(10000).optional(),
  projectId: z.string().min(1).max(40).nullish(),
  everyone: z.boolean().default(true),
  userIds: z.array(z.string().min(1).max(40)).max(100).default([]),
  announce: z.boolean().default(true),
  // Reunión recurrente: la regla y la zona en la que se escribió la hora (para que "10:00" se mantenga).
  repeat: z.object({ freq: z.string(), interval: z.number().optional(), weekdays: z.array(z.number()).optional(), until: z.string().nullish(), count: z.number().nullish() }).nullish(),
  tz: z.string().max(64).optional(),
});

// Agenda una reunión. Cualquiera del equipo puede agendar; avisar a TODO el equipo es de quien lidera.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(createSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  const everyone = d.everyone !== false;
  const userIds = d.userIds ?? [];
  if (everyone && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo un líder puede invitar a todo el equipo: elige a las personas" }, { status: 403 });
  if (!everyone && userIds.length === 0) return NextResponse.json({ error: "Elige a quién invitar" }, { status: 400 });
  try {
    if (d.repeat) {
      const tz = d.tz && isValidTimeZone(d.tz) ? d.tz : null;
      if (!tz) return NextResponse.json({ error: "Falta la zona horaria de la reunión" }, { status: 400 });
      const startsAt = new Date(d.startsAt);
      if (startsAt.getTime() < Date.now() - 10 * 60_000) return NextResponse.json({ error: "Una reunión recurrente debe empezar hoy o más adelante" }, { status: 400 });
      const norm = normalizeRule(d.repeat, dayKey(startsAt, tz));
      if ("error" in norm) return NextResponse.json({ error: norm.error }, { status: 400 });
      const { first } = await createSeries({
        workspaceId: auth.user.workspaceId!,
        creator: { id: auth.user.id, name: auth.user.name },
        title: d.title,
        startsAt,
        durationMin: d.durationMin ?? 60,
        meetUrl: d.meetUrl || null,
        description: d.description,
        projectId: d.projectId ?? null,
        everyone,
        userIds,
        post: d.announce === false ? false : {},
        rule: norm.rule,
        tz,
      });
      const row = await prisma.meeting.findFirstOrThrow({ where: { id: first.id }, include: meetingInclude });
      return NextResponse.json((await toMeetingDTOs([row], auth.user.workspaceId!))[0], { status: 201 });
    }
    const meeting = await createMeeting({
      workspaceId: auth.user.workspaceId!,
      creator: { id: auth.user.id, name: auth.user.name },
      title: d.title,
      startsAt: new Date(d.startsAt),
      durationMin: d.durationMin ?? 60,
      meetUrl: d.meetUrl || null,
      description: d.description,
      projectId: d.projectId ?? null,
      everyone,
      userIds,
      post: d.announce === false ? false : {},
    });
    const row = await prisma.meeting.findFirstOrThrow({ where: { id: meeting.id }, include: meetingInclude });
    return NextResponse.json((await toMeetingDTOs([row], auth.user.workspaceId!))[0], { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
