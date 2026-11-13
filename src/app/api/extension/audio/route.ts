import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authExtension, resolveTeam } from "@/lib/extensionAuth";
import { recordingFor, refreshRecording } from "@/lib/recordings";
import { processPendingTranscriptions } from "@/lib/transcribe";

const MAX_PART_BYTES = 14 * 1024 * 1024; // OpenAI acepta hasta 25 MB; una parte de ~10 min pesa ~2 MB

const safeDecode = (v: string | null) => {
  try {
    return v ? decodeURIComponent(v) : null;
  } catch {
    return v;
  }
};

// Una parte del audio de la reunión (audio/webm). Se guarda y se transcribe; luego el audio se borra.
export async function POST(req: Request) {
  const user = await authExtension(req);
  if (!user) return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
  const part = Number(req.headers.get("x-audio-part"));
  const externalId = req.headers.get("x-recording-id") ?? "";
  if (!Number.isInteger(part) || part < 0 || part > 500 || externalId.length < 6 || externalId.length > 80) return NextResponse.json({ error: "Faltan datos de la parte" }, { status: 400 });
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_PART_BYTES) return NextResponse.json({ error: "La parte de audio es demasiado grande" }, { status: 413 });
  const team = await resolveTeam(user.id, req.headers.get("x-organization-id"));
  if (!team) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength === 0) return NextResponse.json({ error: "Audio vacío" }, { status: 400 });
  if (data.byteLength > MAX_PART_BYTES) return NextResponse.json({ error: "La parte de audio es demasiado grande" }, { status: 413 });
  const rec = await recordingFor({ workspaceId: team.id, userId: user.id, externalId, meetUrl: req.headers.get("x-meeting-url"), title: safeDecode(req.headers.get("x-meeting-title")), meetingId: req.headers.get("x-meeting-id") });
  if (!rec) return NextResponse.json({ error: "Grabación no encontrada" }, { status: 404 });
  const mime = (req.headers.get("content-type") ?? "audio/webm").split(";")[0].slice(0, 40) || "audio/webm";
  // Idempotente: si la parte ya llegó (reintento), no se duplica ni se pisa una ya transcrita.
  const existing = await prisma.audioPart.findUnique({ where: { recordingId_part: { recordingId: rec.id, part } }, select: { id: true } });
  if (!existing) await prisma.audioPart.create({ data: { recordingId: rec.id, part, mimeType: mime, size: data.byteLength, data: data as Uint8Array<ArrayBuffer> } });
  await refreshRecording(rec.id);
  void processPendingTranscriptions().catch((e) => console.error("[transcripción]", e));
  return NextResponse.json({ ok: true, recordingId: rec.id, meetingId: rec.meetingId });
}
