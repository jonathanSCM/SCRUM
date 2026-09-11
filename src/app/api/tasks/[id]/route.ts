import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, assignSprintSchema } from "@/lib/validation";

// Único campo editable desde esta app: a qué sprint pertenece la tarea.
// Todo lo demás (título, tipo, prioridad, encargado, etc.) llega sincronizado
// desde el panel interno y no se puede tocar acá.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const parsed = parseBody(assignSprintSchema, await req.json());
  if ("error" in parsed) return parsed.error;

  const updated = await prisma.task.update({
    where: { id },
    data: { sprintId: parsed.data.sprintId },
  });
  return NextResponse.json(updated);
}
