import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { createMeeting, loadMeetings, toMeetingDTOs } from "@/lib/meetings";
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
    const row = await prisma.meeting.findFirstOrThrow({ where: { id: meeting.id }, include: { project: { select: { id: true, name: true, key: true } }, createdBy: { select: { id: true, name: true } }, attendees: { select: { userId: true } }, _count: { select: { recordings: true } } } });
    return NextResponse.json((await toMeetingDTOs([row], auth.user.workspaceId!))[0], { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
