import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { createSprintSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(createSprintSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");

    const count = await prisma.sprint.count({ where: { projectId: id } });
    const sprint = await prisma.sprint.create({
      data: { projectId: id, name: parsed.data.name ?? `Sprint ${count + 1}`, goal: parsed.data.goal ?? "" },
    });
    await logHistory({ projectId: id, field: "sprint_creado", newValue: sprint.name, actor: auth.user });
    return NextResponse.json(sprint, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
