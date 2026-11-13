import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { refreshRecording } from "@/lib/recordings";
import { processPendingTranscriptions } from "@/lib/transcribe";
import { parseBody, readJson } from "@/lib/validation";

async function authorize(id: string, rid: string) {
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return { error: auth.error } as const;
  const rec = await prisma.meetingRecording.findFirst({ where: { id: rid, meetingId: id }, select: { id: true, recordedById: true } });
  if (!rec) return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) } as const;
  if (rec.recordedById !== auth.user.id && auth.user.role !== "LEAD") return { error: NextResponse.json({ error: "Solo quien grabó o un líder puede hacerlo" }, { status: 403 }) } as const;
  return { auth, rec } as const;
}

// Reintentar la transcripción de las partes que fallaron.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const a = await authorize(id, rid);
  if ("error" in a) return a.error;
  const parsed = parseBody(z.object({ retry: z.literal(true) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    await prisma.audioPart.updateMany({ where: { recordingId: rid, status: "FAILED", data: { not: null } }, data: { status: "PENDING", attempts: 0 } });
    await refreshRecording(rid);
    void processPendingTranscriptions().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// Borrar una grabación (con su transcripción y su audio, si todavía lo hay).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const a = await authorize(id, rid);
  if ("error" in a) return a.error;
  try {
    await prisma.meetingRecording.delete({ where: { id: rid } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
