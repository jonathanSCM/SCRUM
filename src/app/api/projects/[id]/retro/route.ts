import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, retroItemSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(retroItemSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: parsed.data.sprintId }, select: { projectId: true } });
    if (!sprint || sprint.projectId !== id) return notFound("Ese sprint no pertenece al proyecto");
    const item = await prisma.retroItem.create({
      data: { projectId: id, sprintId: parsed.data.sprintId, column: parsed.data.column, body: parsed.data.body, authorId: auth.user.id },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
