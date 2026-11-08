import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { logHistory } from "@/lib/history";
import { MAX_RESOURCE_BYTES, normalizeTags, normalizeUrl } from "@/lib/scrum/resources";
import { checkBelongsTo, listResources, resourceSelect, toResourceDTO } from "@/lib/resourceData";

// Archivos y enlaces del proyecto.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await listResources(id));
  } catch (e) {
    return errorResponse(e);
  }
}

// Sube un archivo (multipart: file, title?, tags?, sprintId?, taskId?) o agrega un enlace (JSON: url, title?, tags?, sprintId?, taskId?).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const { user } = auth;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, key: true } });
    if (!project) return notFound("Proyecto no encontrado");

    const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
    const form = isForm ? await req.formData().catch(() => null) : null;
    const json = !isForm ? ((await req.json().catch(() => null)) as Record<string, unknown> | null) : null;
    const get = (k: string): unknown => (form ? form.get(k) : json?.[k]);
    const str = (k: string): string => (typeof get(k) === "string" ? (get(k) as string).trim() : "");

    const sprintId = str("sprintId") || null;
    const taskId = str("taskId") || null;
    const bad = await checkBelongsTo(id, sprintId, taskId);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const tags = normalizeTags(typeof get("tags") === "string" ? get("tags") : get("tags") ?? []);

    let data: Record<string, unknown>;
    const file = form?.get("file");
    if (file instanceof File) {
      if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
      if (file.size > MAX_RESOURCE_BYTES) return NextResponse.json({ error: `El archivo supera el máximo de ${MAX_RESOURCE_BYTES / (1024 * 1024)} MB` }, { status: 400 });
      const filename = file.name.slice(0, 200) || "archivo";
      data = { kind: "FILE", title: str("title").slice(0, 200) || filename, filename, mimeType: file.type || "application/octet-stream", size: file.size, data: new Uint8Array(await file.arrayBuffer()) };
    } else {
      const url = normalizeUrl(str("url"));
      if (!url) return NextResponse.json({ error: "Pega un enlace válido (http o https) o elige un archivo" }, { status: 400 });
      data = { kind: "LINK", title: str("title").slice(0, 200) || url.replace(/^https?:\/\//, "").slice(0, 120), url };
    }

    const row = await prisma.projectResource.create({
      data: { ...data, tags: JSON.stringify(tags), projectId: id, sprintId, taskId, uploadedById: user.id } as never,
      select: resourceSelect,
    });
    await logHistory({ projectId: id, field: data.kind === "LINK" ? "enlace_agregado" : "archivo_agregado", newValue: String(data.title), actor: user });
    return NextResponse.json(toResourceDTO(row, project.key), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
