import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson, createGroupSchema } from "@/lib/validation";
import { suggestProjectKey } from "@/lib/scrum/issueKey";
import { setProjectMembers } from "@/lib/projectMembers";
import { listGroups } from "@/lib/groups";
import { logHistory } from "@/lib/history";

// Grupos de tareas (tareas sueltas que todavía no son un proyecto): ?archived=1 trae los archivados.
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    const archived = new URL(req.url).searchParams.get("archived") === "1";
    return NextResponse.json({ groups: await listGroups(auth.user.id, auth.user.workspaceId!, { archived }) });
  } catch (e) {
    return errorResponse(e);
  }
}

// Cualquier persona del equipo crea un grupo. Por defecto es del equipo; con isPrivate solo lo ven quien lo crea y las personas que se elijan.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const parsed = parseBody(createGroupSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { name, isPrivate = false } = parsed.data;
  try {
    const workspaceId = user.workspaceId!;
    const taken = (await prisma.project.findMany({ where: { workspaceId }, select: { key: true } })).map((p) => p.key).filter((k): k is string => !!k);
    const firstStatus = await prisma.statusOption.findFirst({ where: { workspaceId }, orderBy: { order: "asc" } });
    if (!firstStatus) return NextResponse.json({ error: "No hay estados de proyecto configurados" }, { status: 400 });
    const group = await prisma.project.create({
      data: { name, key: suggestProjectKey(name, taken), kind: "GROUP", isPrivate, ownerId: user.id, statusId: firstStatus.id, leadUserId: user.id, workspaceId },
      select: { id: true, name: true, key: true, isPrivate: true },
    });
    if (isPrivate && parsed.data.memberIds?.length) await setProjectMembers(group.id, workspaceId, parsed.data.memberIds.filter((id) => id !== user.id), user.name, "grupo");
    await logHistory({ projectId: group.id, field: "grupo_creado", newValue: group.name, actor: user });
    return NextResponse.json(group, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
