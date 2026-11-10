import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { channelSlug, channelSummaries } from "@/lib/chatChannels";
import { parseBody, readJson } from "@/lib/validation";

const MAX_CHANNELS = 20;

export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    // Canales con su último mensaje y los mensajes sin leer de la persona (panel izquierdo del chat).
    return NextResponse.json(await channelSummaries(auth.user.workspaceId!, auth.user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto").max(30),
  // "PRIVATE" = solo las personas elegidas; "CUSTOM" (o sin indicar) = canal abierto a todo el equipo.
  kind: z.enum(["CUSTOM", "PRIVATE"]).default("CUSTOM"),
  memberIds: z.array(z.string().min(1).max(40)).max(60).default([]),
});

// Solo dueño o admin crea canales (abiertos o privados).
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(createSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const workspaceId = auth.user.workspaceId!;
    const { kind } = parsed.data;
    if ((await prisma.chatChannel.count({ where: { workspaceId, kind: { in: ["CUSTOM", "PRIVATE"] } } })) >= MAX_CHANNELS) return NextResponse.json({ error: `Máximo ${MAX_CHANNELS} canales propios` }, { status: 400 });
    const slug = channelSlug(parsed.data.name);
    if (await prisma.chatChannel.findUnique({ where: { workspaceId_slug: { workspaceId, slug } }, select: { id: true } })) {
      return NextResponse.json({ error: "Ya existe un canal con ese nombre" }, { status: 400 });
    }
    // En un canal privado entran quien lo crea y las personas elegidas (que deben ser del equipo).
    let memberIds: string[] = [];
    if (kind === "PRIVATE") {
      const valid = await prisma.membership.findMany({ where: { workspaceId, userId: { in: parsed.data.memberIds } }, select: { userId: true } });
      memberIds = [...new Set([auth.user.id, ...valid.map((v) => v.userId)])];
      if (memberIds.length < 2) return NextResponse.json({ error: "Elige al menos una persona para el canal privado" }, { status: 400 });
    }
    const ch = await prisma.chatChannel.create({ data: { workspaceId, name: parsed.data.name, slug, kind, ...(kind === "PRIVATE" ? { members: { create: memberIds.map((userId) => ({ userId })) } } : {}) } });
    return NextResponse.json({ id: ch.id, name: ch.name, kind, projectId: null, projectKey: null }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
