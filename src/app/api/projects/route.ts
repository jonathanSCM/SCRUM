import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { createProjectSchema, parseBody, readJson } from "@/lib/validation";
import { suggestProjectKey } from "@/lib/scrum/issueKey";
import { logHistory } from "@/lib/history";

export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const parsed = parseBody(createProjectSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { name, description } = parsed.data;

  try {
    const existingKeys = (await prisma.project.findMany({ where: { workspaceId: user.workspaceId! }, select: { key: true } })).map((p) => p.key).filter((k): k is string => !!k);
    let key = parsed.data.key;
    if (key) {
      if (existingKeys.includes(key)) return NextResponse.json({ error: `La clave ${key} ya la usa otro proyecto` }, { status: 400 });
    } else {
      key = suggestProjectKey(name, existingKeys);
    }

    const firstStatus = await prisma.statusOption.findFirst({ where: { workspaceId: user.workspaceId! }, orderBy: { order: "asc" } });
    if (!firstStatus) return NextResponse.json({ error: "No hay estados de proyecto configurados" }, { status: 400 });

    const project = await prisma.project.create({
      data: { name, key, description: description ?? "", statusId: firstStatus.id, leadUserId: user.id, workspaceId: user.workspaceId! },
      include: { status: true },
    });
    await logHistory({ projectId: project.id, field: "proyecto_creado", newValue: project.name, actor: user });
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
