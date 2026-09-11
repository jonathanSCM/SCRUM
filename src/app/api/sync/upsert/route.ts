import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSyncToken } from "@/lib/syncAuth";
import { parseBody, syncUpsertSchema } from "@/lib/validation";

// Servidor-a-servidor: el panel interno llama acá cada vez que cambia un
// proyecto/tarea/estado. No hay sesión de usuario, solo el token fijo
// compartido (ver src/lib/syncAuth.ts).
export async function POST(req: Request) {
  if (!isValidSyncToken(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = parseBody(syncUpsertSchema, await req.json());
  if ("error" in parsed) return parsed.error;
  const { type, data } = parsed.data;

  if (type === "status") {
    await prisma.statusOption.upsert({
      where: { id: data.id },
      create: { id: data.id, name: data.name, color: data.color, order: data.order },
      update: { name: data.name, color: data.color, order: data.order },
    });
  } else if (type === "project") {
    await prisma.project.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        name: data.name,
        description: data.description ?? "",
        repoUrl: data.repoUrl ?? null,
        deployUrl: data.deployUrl ?? null,
        statusId: data.statusId,
        assigneeName: data.assigneeName ?? null,
      },
      update: {
        name: data.name,
        description: data.description ?? "",
        repoUrl: data.repoUrl ?? null,
        deployUrl: data.deployUrl ?? null,
        statusId: data.statusId,
        assigneeName: data.assigneeName ?? null,
      },
    });
  } else if (type === "task") {
    await prisma.task.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? "",
        type: data.type,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeName: data.assigneeName ?? null,
        moduleName: data.moduleName ?? null,
      },
      update: {
        title: data.title,
        description: data.description ?? "",
        type: data.type,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeName: data.assigneeName ?? null,
        moduleName: data.moduleName ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
