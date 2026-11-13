import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authExtension, resolveTeam } from "@/lib/extensionAuth";
import { recordingFor, refreshRecording } from "@/lib/recordings";

const MAX_CAPTIONS = 600_000;

const schema = z.object({
  meetingUrl: z.string().max(400).default(""),
  transcript: z.string().max(200_000).default(""),
  recordingId: z.string().min(6).max(80),
  final: z.boolean().default(false),
  start: z.boolean().optional(),
  organizationId: z.string().max(40).optional(),
  title: z.string().max(200).optional(),
  meetingId: z.string().max(40).optional(),
});

// Subtítulos de Meet (con quién habla), en partes mientras se graba y un cierre al terminar.
export async function POST(req: Request) {
  const user = await authExtension(req);
  if (!user) return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;
  const team = await resolveTeam(user.id, d.organizationId);
  if (!team) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  const rec = await recordingFor({ workspaceId: team.id, userId: user.id, externalId: d.recordingId, meetUrl: d.meetingUrl, title: d.title, meetingId: d.meetingId });
  if (!rec) return NextResponse.json({ error: "Grabación no encontrada" }, { status: 404 });
  const text = d.transcript.trim();
  const captions = d.start ? text : [rec.captions, text].filter(Boolean).join("\n");
  await prisma.meetingRecording.update({
    where: { id: rec.id },
    data: { captions: captions.slice(0, MAX_CAPTIONS), ...(d.final ? { finalized: true } : {}), ...(d.title ? { title: d.title.slice(0, 200) } : {}) },
  });
  await refreshRecording(rec.id);
  return NextResponse.json({ ok: true, recordingId: rec.id, meetingId: rec.meetingId });
}
