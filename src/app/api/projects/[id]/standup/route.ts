import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, standupSchema } from "@/lib/validation";
import { isValidDateString } from "@/lib/scrum/ceremonies";

const entryInclude = { user: { select: { id: true, name: true } } };

// Daily de un día: ?date=YYYY-MM-DD. Devuelve las entradas y quién falta.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isValidDateString(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  try {
    const [entries, users] = await Promise.all([
      prisma.standupEntry.findMany({ where: { projectId: id, date }, include: entryInclude, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ entries, members: users });
  } catch (e) {
    return errorResponse(e);
  }
}

// Guarda (o actualiza) MI daily del día.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(standupSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { date, yesterday = "", today = "", blockers = "", help = "" } = parsed.data;
  if (!isValidDateString(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");
    const entry = await prisma.standupEntry.upsert({
      where: { projectId_userId_date: { projectId: id, userId: auth.user.id, date } },
      create: { projectId: id, userId: auth.user.id, date, yesterday, today, blockers, help },
      update: { yesterday, today, blockers, help },
      include: entryInclude,
    });
    return NextResponse.json(entry);
  } catch (e) {
    return errorResponse(e);
  }
}
