import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";

const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/;

// Descarga (o vista previa de imágenes y PDF) de un archivo del proyecto.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ resource: id });
  if ("error" in auth) return auth.error;
  try {
    const r = await prisma.projectResource.findUnique({ where: { id }, select: { kind: true, filename: true, mimeType: true, size: true, data: true } });
    if (!r || r.kind !== "FILE" || !r.data) return notFound("Archivo no encontrado");
    const mime = r.mimeType ?? "application/octet-stream";
    const inline = INLINE_TYPES.test(mime);
    return new NextResponse(new Uint8Array(r.data), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Length": String(r.size ?? r.data.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(r.filename ?? "archivo")}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
