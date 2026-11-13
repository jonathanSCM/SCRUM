import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, convertGroupSchema } from "@/lib/validation";
import { isValidProjectKey, suggestProjectKey } from "@/lib/scrum/issueKey";
import { canManageGroup } from "@/lib/groups";
import { logHistory } from "@/lib/history";

// Convierte un grupo de tareas en un proyecto de verdad: se crea el proyecto, las tareas se mueven a él (con sus
// comentarios, adjuntos y personas) y el grupo queda ARCHIVADO, apuntando al proyecto nuevo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const parsed = parseBody(convertGroupSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const workspaceId = user.workspaceId!;
    const group = await prisma.project.findUnique({ where: { id }, select: { id: true, kind: true, name: true, key: true, ownerId: true, archivedAt: true, convertedToId: true, description: true } });
    if (!group || group.kind !== "GROUP") return notFound("Grupo no encontrado");
    if (!canManageGroup(user, group)) return NextResponse.json({ error: "Solo quien creó el grupo o un líder puede convertirlo en proyecto" }, { status: 403 });
    if (group.convertedToId) return NextResponse.json({ error: "Este grupo ya se convirtió en proyecto" }, { status: 400 });

    const firstStatus = await prisma.statusOption.findFirst({ where: { workspaceId }, orderBy: { order: "asc" } });
    if (!firstStatus) return NextResponse.json({ error: "No hay estados de proyecto configurados" }, { status: 400 });
    const name = parsed.data.name ?? group.name;
    // La clave del grupo se libera: el proyecto puede usarla (los tickets se renumeran con la clave nueva).
    const taken = (await prisma.project.findMany({ where: { workspaceId, id: { not: id } }, select: { key: true } })).map((p) => p.key).filter((k): k is string => !!k);
    let key = parsed.data.key;
    if (key) {
      if (!isValidProjectKey(key) || taken.includes(key)) return NextResponse.json({ error: `La clave ${key} ya la usa otro proyecto` }, { status: 400 });
    } else {
      key = suggestProjectKey(name, taken);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.project.update({ where: { id }, data: { key: null } });
        const project = await tx.project.create({
          data: { name, key, description: group.description, statusId: firstStatus.id, leadUserId: user.id, workspaceId, kind: "PROJECT" },
          select: { id: true, name: true, key: true },
        });
        const tasks = await tx.task.findMany({ where: { projectId: id }, orderBy: [{ number: "asc" }, { createdAt: "asc" }], select: { id: true } });
        let n = 0;
        for (const t of tasks) await tx.task.update({ where: { id: t.id }, data: { projectId: project.id, number: ++n }, select: { id: true } });
        await tx.project.update({ where: { id: project.id }, data: { taskSeq: n } });
        const move = { where: { projectId: id }, data: { projectId: project.id } };
        await tx.sprint.updateMany(move);
        await tx.attachment.updateMany(move);
        await tx.projectResource.updateMany(move);
        await tx.note.updateMany(move);
        await tx.retroItem.updateMany(move);
        await tx.projectContact.updateMany(move);
        await tx.project.update({ where: { id }, data: { archivedAt: new Date(), convertedToId: project.id } });
        return { project, moved: n };
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
    await logHistory({ projectId: result.project.id, field: "proyecto_creado", newValue: `${result.project.name} (desde el grupo «${group.name}», ${result.moved} tareas)`, actor: user });
    await logHistory({ projectId: id, field: "grupo_convertido", newValue: result.project.name, actor: user });
    return NextResponse.json({ id: result.project.id, name: result.project.name, key: result.project.key, moved: result.moved }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
