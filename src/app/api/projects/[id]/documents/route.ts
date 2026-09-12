import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mainPanelFetch, isMainPanelConfigured } from "@/lib/mainPanel";

type MainPanelDocument = {
  id: string;
  projectId: string;
  filename: string;
  fileType: string;
  docType: string;
  uploadedAt: string;
};

// Mismo patrón que PATCH /api/projects/[id]: el archivo se sube primero al
// panel interno (el único que puede extraer texto y correr el análisis de
// IA) y acá solo se guardan los campos de display -- nunca el texto crudo
// ni el análisis.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    console.error("[documents] MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN no configurados -- no se puede subir.");
    return NextResponse.json({ error: "No se pudo subir el documento. Probá de nuevo más tarde." }, { status: 400 });
  }

  const { id } = await params;
  const incoming = await req.formData();
  const file = incoming.get("file") as File | null;
  const docType = (incoming.get("docType") as string) || "RESUMEN_PROYECTO";
  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const forward = new FormData();
  forward.set("file", file, file.name);
  forward.set("docType", docType);

  let mainRes: Response;
  try {
    mainRes = await mainPanelFetch(`/api/projects/${id}/documents`, { method: "POST", body: forward });
  } catch (e) {
    console.error("[documents] error contactando al panel interno:", e);
    return NextResponse.json({ error: "No se pudo subir el documento. Probá de nuevo más tarde." }, { status: 502 });
  }

  if (!mainRes.ok) {
    const body = await mainRes.json().catch(() => ({}));
    console.error("[documents] el panel interno rechazó el documento:", body.error);
    return NextResponse.json(
      { error: "No se pudo subir el documento. Revisá el archivo e intentá de nuevo." },
      { status: mainRes.status }
    );
  }

  const { document } = (await mainRes.json()) as { document: MainPanelDocument | null };
  if (!document) return NextResponse.json({ error: "No se pudo subir el documento." }, { status: 502 });

  const saved = await prisma.document.upsert({
    where: { id: document.id },
    create: {
      id: document.id,
      projectId: document.projectId,
      filename: document.filename,
      fileType: document.fileType,
      docType: document.docType,
      uploadedAt: new Date(document.uploadedAt),
    },
    update: {
      filename: document.filename,
      fileType: document.fileType,
      docType: document.docType,
      uploadedAt: new Date(document.uploadedAt),
    },
  });

  return NextResponse.json({ document: saved }, { status: 201 });
}
