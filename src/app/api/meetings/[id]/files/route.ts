import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canViewRecordings } from "@/lib/recordings";

const MEETING_FILE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 25;

async function meetingFor(id: string) {
  return prisma.meeting.findUnique({ where: { id }, select: { id: true, workspaceId: true, everyone: true, createdById: true } });
}

// Archivos de una reunión (acta, presentación, lo que se trató…). Los ven y suben los invitados, quien la agendó y los líderes.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const meeting = await meetingFor(id);
    if (!meeting) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!(await canViewRecordings(auth.user, meeting))) return NextResponse.json({ files: [], hidden: await prisma.meetingFile.count({ where: { meetingId: id } }) });
    const rows = await prisma.meetingFile.findMany({ where: { meetingId: id }, orderBy: { createdAt: "asc" }, select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } } });
    return NextResponse.json({ hidden: 0, files: rows.map((f) => ({ ...f, createdAt: f.createdAt.toISOString(), canDelete: auth.user.role === "LEAD" || f.uploadedBy?.id === auth.user.id || meeting.createdById === auth.user.id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  try {
    const meeting = await meetingFor(id);
    if (!meeting || !(await canViewRecordings(auth.user, meeting))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Elige un archivo" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (file.size > MEETING_FILE_MAX_BYTES) return NextResponse.json({ error: `El archivo supera el máximo de ${MEETING_FILE_MAX_BYTES / (1024 * 1024)} MB` }, { status: 400 });
    if ((await prisma.meetingFile.count({ where: { meetingId: id } })) >= MAX_FILES) return NextResponse.json({ error: `Máximo ${MAX_FILES} archivos por reunión` }, { status: 400 });
    const row = await prisma.meetingFile.create({
      data: { meetingId: id, filename: file.name.slice(0, 200) || "archivo", mimeType: file.type || "application/octet-stream", size: file.size, data: new Uint8Array(await file.arrayBuffer()), uploadedById: auth.user.id },
      select: { id: true, filename: true, mimeType: true, size: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
