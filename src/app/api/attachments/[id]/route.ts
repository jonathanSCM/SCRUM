import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { logHistory } from "@/lib/history";

const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return notFound("Adjunto no encontrado");

    const inline = INLINE_TYPES.test(attachment.mimeType);
    const encoded = encodeURIComponent(attachment.filename);
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": inline ? attachment.mimeType : "application/octet-stream",
        "Content-Length": String(attachment.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      select: { id: true, filename: true, projectId: true, taskId: true, task: { select: { title: true } } },
    });
    if (!attachment) return notFound("Adjunto no encontrado");
    await prisma.attachment.delete({ where: { id } });
    await logHistory({
      projectId: attachment.projectId,
      taskId: attachment.taskId,
      taskTitle: attachment.task?.title ?? null,
      field: "adjunto_eliminado",
      oldValue: attachment.filename,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
