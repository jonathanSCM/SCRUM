import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { convertChecklistItem, IssueError } from "@/lib/issues";
import { toIssueCard } from "@/lib/issueView";
import { prisma } from "@/lib/prisma";

// Convierte una subtarea (paso de la lista de un ticket) en un ticket propio que sigue relacionado con el de origen.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await apiUser({ issue: id });
  if ("error" in auth) return auth.error;
  try {
    const { issue, key } = await convertChecklistItem(id, itemId, { id: auth.user.id, name: auth.user.name });
    const project = await prisma.project.findUnique({ where: { id: issue.projectId }, select: { key: true } });
    return NextResponse.json({ key, issue: toIssueCard(issue, project?.key ?? null) }, { status: 201 });
  } catch (e) {
    if (e instanceof IssueError) return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
    return errorResponse(e);
  }
}
