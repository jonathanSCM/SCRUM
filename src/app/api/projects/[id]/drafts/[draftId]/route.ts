import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { toDraftDTO } from "@/lib/drafts";
import { draftSchema, parseBody, readJson } from "@/lib/validation";

// Un borrador solo lo toca su dueño; para cualquier otra persona es como si no existiera (404).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { id, draftId } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(draftSchema.partial(), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const own = await prisma.draftIssue.findFirst({ where: { id: draftId, projectId: id, ownerId: auth.user.id }, select: { id: true, issueType: true } });
    if (!own) return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
    const d = parsed.data;
    const type = d.issueType ?? own.issueType;
    const row = await prisma.draftIssue.update({
      where: { id: draftId },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.issueType !== undefined ? { issueType: d.issueType } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.storyPoints !== undefined ? { storyPoints: d.storyPoints } : {}),
        ...(d.labels !== undefined ? { labels: JSON.stringify(d.labels) } : {}),
        ...(d.assigneeUserId !== undefined ? { assigneeUserId: d.assigneeUserId } : {}),
        ...(type === "EPIC" ? { epicId: null } : d.epicId !== undefined ? { epicId: d.epicId } : {}),
      },
    });
    return NextResponse.json(toDraftDTO(row));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { id, draftId } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    await prisma.draftIssue.deleteMany({ where: { id: draftId, projectId: id, ownerId: auth.user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
