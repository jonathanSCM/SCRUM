import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { normalizeTags } from "@/lib/scrum/resources";
import { CATEGORY_VALUES } from "@/lib/scrum/library";
import { cardInclude, listCards, toCardDTO } from "@/lib/libraryData";

export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await listCards(auth.user.workspaceId!));
  } catch (e) {
    return errorResponse(e);
  }
}

// Crea una tarjeta (vacía). Los archivos y enlaces se agregan después en /api/library/cards/{id}/items.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(
    z.object({
      title: z.string().trim().min(1, "Ponle un título").max(200),
      description: z.string().trim().max(5000).optional(),
      category: z.enum(CATEGORY_VALUES).optional(),
      tags: z.array(z.string()).max(30).optional(),
      projectId: z.string().min(1).max(40).nullish(),
    }),
    await readJson(req)
  );
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const workspaceId = auth.user.workspaceId!;
    if (d.projectId && !(await prisma.project.findFirst({ where: { id: d.projectId, workspaceId }, select: { id: true } }))) return NextResponse.json({ error: "Ese proyecto no es de este equipo" }, { status: 400 });
    const row = await prisma.fileCard.create({
      data: { workspaceId, title: d.title, description: d.description ?? "", category: d.category ?? "OTRO", tags: JSON.stringify(normalizeTags(d.tags ?? [])), projectId: d.projectId ?? null, createdById: auth.user.id },
      include: cardInclude,
    });
    return NextResponse.json(toCardDTO(row), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
