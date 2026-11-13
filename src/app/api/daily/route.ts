import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson, standupSchema } from "@/lib/validation";
import { isValidDateString } from "@/lib/scrum/ceremonies";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/scrum/countries";
import { dailySuggestion } from "@/lib/daily";

const entryInclude = { user: { select: { id: true, name: true } } };

// Daily GENERAL del equipo de un día: ?date=YYYY-MM-DD. Devuelve las respuestas, quién falta y
// (solo para quien pregunta) un borrador armado con su trabajo en tickets.
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const workspaceId = auth.user.workspaceId!;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isValidDateString(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  try {
    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { timezone: true, notifPrefs: { select: { tz: true } } } });
    const tz = [me?.timezone, me?.notifPrefs?.tz].find((z): z is string => !!z && isValidTimeZone(z)) ?? DEFAULT_TZ;
    const [entries, members, suggestion] = await Promise.all([
      prisma.standupEntry.findMany({ where: { workspaceId, date }, include: entryInclude, orderBy: { createdAt: "asc" } }),
      membersOf(workspaceId).then((m) => m.map(({ id, name }) => ({ id, name }))),
      dailySuggestion(auth.user.id, workspaceId, date, tz),
    ]);
    return NextResponse.json({ entries, members, suggestion });
  } catch (e) {
    return errorResponse(e);
  }
}

// Guarda (o actualiza) MI daily del día en este equipo.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const workspaceId = auth.user.workspaceId!;

  const parsed = parseBody(standupSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { date, yesterday = "", today = "", blockers = "", help = "" } = parsed.data;
  if (!isValidDateString(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  try {
    const entry = await prisma.standupEntry.upsert({
      where: { workspaceId_userId_date: { workspaceId, userId: auth.user.id, date } },
      create: { workspaceId, userId: auth.user.id, date, yesterday, today, blockers, help },
      update: { yesterday, today, blockers, help },
      include: entryInclude,
    });
    return NextResponse.json(entry);
  } catch (e) {
    return errorResponse(e);
  }
}
