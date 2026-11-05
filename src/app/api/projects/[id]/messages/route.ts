import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { messageSchema, parseBody, readJson } from "@/lib/validation";

const include = { author: { select: { id: true, name: true } } };

// Últimos mensajes del chat del proyecto (orden cronológico). ?after=<ISO>
// devuelve solo los más nuevos, para el refresco periódico.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  try {
    const rows = await prisma.projectMessage.findMany({
      where: { projectId: id, ...(afterDate && !Number.isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include,
    });
    return NextResponse.json(rows.reverse());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(messageSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");
    const message = await prisma.projectMessage.create({ data: { projectId: id, authorId: auth.user.id, body: parsed.data.body }, include });
    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
