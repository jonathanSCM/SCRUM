import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { logHistory } from "@/lib/history";
import { MAX_ATTACHMENT_BYTES } from "@/lib/scrum/constants";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  try {
    const issue = await prisma.task.findUnique({ where: { id }, select: { id: true, title: true, projectId: true } });
    if (!issue) return notFound("Ticket no encontrado");

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Elegí un archivo para adjuntar" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `El archivo supera el máximo de ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB` }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const attachment = await prisma.attachment.create({
      data: {
        taskId: id,
        projectId: issue.projectId,
        filename: file.name.slice(0, 200) || "archivo",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data: bytes,
        uploadedById: user.id,
      },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
    });
    await logHistory({ projectId: issue.projectId, taskId: id, taskTitle: issue.title, field: "adjunto_subido", newValue: attachment.filename, actor: user });
    return NextResponse.json(attachment, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
