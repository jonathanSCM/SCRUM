import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { getChatFile } from "@/lib/fileStore";

// Solo imágenes y PDF se muestran dentro del navegador; el resto se descarga.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const file = await getChatFile(id);
    if (!file) return notFound("Archivo no encontrado");
    const inline = INLINE_TYPES.test(file.mimeType);
    return new NextResponse(file.data as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": inline ? file.mimeType : "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
