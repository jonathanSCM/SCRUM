import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { MAX_RESOURCE_BYTES, friendlyTitle, normalizeUrl } from "@/lib/scrum/resources";
import { checkCardCapacity } from "@/lib/scrum/library";
import { cardById, cardUsage } from "@/lib/libraryData";

export const maxDuration = 120;

// Agrega a una tarjeta VARIOS archivos de una vez (multipart, campo "file" repetido) o un enlace (JSON { url, title? }).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ fileCard: id });
  if ("error" in auth) return auth.error;
  try {
    const card = await prisma.fileCard.findUnique({ where: { id }, select: { id: true } });
    if (!card) return notFound("Tarjeta no encontrada");

    const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
    if (isForm) {
      const form = await req.formData().catch(() => null);
      const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) return NextResponse.json({ error: "Elige al menos un archivo" }, { status: 400 });
      const tooBig = files.find((f) => f.size > MAX_RESOURCE_BYTES);
      if (tooBig) return NextResponse.json({ error: `"${tooBig.name}" supera el máximo de ${MAX_RESOURCE_BYTES / (1024 * 1024)} MB` }, { status: 400 });
      const bad = checkCardCapacity(await cardUsage(id), files);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      for (const f of files) {
        const filename = f.name.slice(0, 200) || "archivo";
        await prisma.fileCardItem.create({
          data: { cardId: id, kind: "FILE", title: filename, filename, mimeType: f.type || "application/octet-stream", size: f.size, data: new Uint8Array(await f.arrayBuffer()), uploadedById: auth.user.id },
        });
      }
    } else {
      const body = (await req.json().catch(() => null)) as { url?: unknown; title?: unknown } | null;
      const url = typeof body?.url === "string" ? normalizeUrl(body.url) : null;
      if (!url) return NextResponse.json({ error: "Pega un enlace válido (http o https)" }, { status: 400 });
      const bad = checkCardCapacity(await cardUsage(id), [{ size: 0 }]);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : friendlyTitle(url);
      await prisma.fileCardItem.create({ data: { cardId: id, kind: "LINK", title, url, uploadedById: auth.user.id } });
    }
    await prisma.fileCard.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json(await cardById(id), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
