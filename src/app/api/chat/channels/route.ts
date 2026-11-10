import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { channelSlug, channelSummaries, ensureChannels } from "@/lib/chatChannels";
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

// Solo dueño o admin crea canales.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ name: z.string().trim().min(2, "Nombre muy corto").max(30) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const workspaceId = auth.user.workspaceId!;
    const existing = await ensureChannels(workspaceId);
    if (existing.length >= MAX_CHANNELS) return NextResponse.json({ error: `Máximo ${MAX_CHANNELS} canales` }, { status: 400 });
    const slug = channelSlug(parsed.data.name);
    if (await prisma.chatChannel.findUnique({ where: { workspaceId_slug: { workspaceId, slug } }, select: { id: true } })) {
      return NextResponse.json({ error: "Ya existe un canal con ese nombre" }, { status: 400 });
    }
    const ch = await prisma.chatChannel.create({ data: { workspaceId, name: parsed.data.name, slug, kind: "CUSTOM" } });
    return NextResponse.json({ id: ch.id, name: ch.name, kind: "CUSTOM", projectId: null, projectKey: null }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
