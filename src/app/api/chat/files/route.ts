import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { MAX_ATTACHMENT_BYTES } from "@/lib/scrum/constants";
import { putChatFile } from "@/lib/fileStore";

// Sube un archivo para adjuntarlo a un mensaje (se enlaza al enviar el mensaje).
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Elegí un archivo" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `El archivo supera el máximo de ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB` }, { status: 400 });
    }
    const id = await putChatFile({
      filename: file.name.slice(0, 200) || "archivo",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: new Uint8Array(await file.arrayBuffer()),
      uploadedById: auth.user.id,
    });
    return NextResponse.json({ id, filename: file.name.slice(0, 200) || "archivo", mimeType: file.type || "application/octet-stream", size: file.size }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
