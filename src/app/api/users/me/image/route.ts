import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { IMAGE_KINDS, MAX_IMAGE_BYTES, processProfileImage, type ImageKind } from "@/lib/images";

const kindOf = (v: unknown): ImageKind | null => (v === "avatar" ? "AVATAR" : v === "banner" ? "BANNER" : null);

// Sube o cambia MI foto de perfil o banner (multipart: kind=avatar|banner, file).
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const form = await req.formData().catch(() => null);
    const kind = kindOf(form?.get("kind"));
    const file = form?.get("file");
    if (!kind || !(file instanceof File)) return NextResponse.json({ error: "Elegí una imagen" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `La imagen supera los ${MAX_IMAGE_BYTES / (1024 * 1024)} MB` }, { status: 400 });

    let processed;
    try {
      processed = await processProfileImage(Buffer.from(await file.arrayBuffer()), kind);
    } catch {
      return NextResponse.json({ error: "No se pudo leer la imagen. Usá un archivo JPG, PNG, WebP o GIF." }, { status: 400 });
    }
    await prisma.userImage.upsert({
      where: { userId_kind: { userId: auth.user.id, kind } },
      create: { userId: auth.user.id, kind, mimeType: processed.mimeType, data: new Uint8Array(processed.data) },
      update: { mimeType: processed.mimeType, data: new Uint8Array(processed.data) },
    });
    return NextResponse.json({ ok: true, size: IMAGE_KINDS[kind] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const kind = kindOf(new URL(req.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  try {
    await prisma.userImage.deleteMany({ where: { userId: auth.user.id, kind } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
