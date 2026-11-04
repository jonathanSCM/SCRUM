import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { createNoteSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(createNoteSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");
    const note = await prisma.note.create({
      data: {
        projectId: id,
        authorId: auth.user.id,
        title: parsed.data.title,
        body: parsed.data.body ?? "",
        kind: parsed.data.kind ?? "GENERAL",
        pinned: parsed.data.pinned ?? false,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    await logHistory({ projectId: id, field: "nota_creada", newValue: note.title, actor: auth.user });
    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
