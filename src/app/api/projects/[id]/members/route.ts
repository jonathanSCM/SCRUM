import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { setProjectMembers } from "@/lib/projectMembers";
import { logHistory } from "@/lib/history";

// Define quiénes del equipo trabajan en el proyecto (solo líderes). A las personas nuevas se les avisa.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ userIds: z.array(z.string().min(1).max(40)).max(100) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { workspaceId: true } });
    if (!project?.workspaceId) return notFound("Proyecto no encontrado");
    const res = await setProjectMembers(id, project.workspaceId, parsed.data.userIds, auth.user.name);
    if (res.added.length) await logHistory({ projectId: id, field: "miembros_proyecto", newValue: `${res.members.length} personas`, actor: auth.user });
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
