import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { toDraftDTO, listMyDrafts } from "@/lib/drafts";
import { draftSchema, parseBody, readJson } from "@/lib/validation";

// Mis borradores privados de este proyecto (nadie más los ve).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await listMyDrafts(auth.user.id, { projectId: id }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(draftSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const d = parsed.data;
    const row = await prisma.draftIssue.create({
      data: { projectId: id, ownerId: auth.user.id, title: d.title, description: d.description ?? "", issueType: d.issueType ?? "TASK", priority: d.priority ?? "MEDIA", storyPoints: d.storyPoints ?? null, labels: JSON.stringify(d.labels ?? []), assigneeUserId: d.assigneeUserId ?? null, epicId: d.issueType === "EPIC" ? null : d.epicId ?? null },
    });
    return NextResponse.json(toDraftDTO(row), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
