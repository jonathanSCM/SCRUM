import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { ensureChannels } from "@/lib/chatChannels";
import { parseBody, readJson } from "@/lib/validation";

// Borra un canal propio (no "General", "Reuniones" ni los de proyecto). Los mensajes de un canal abierto pasan a
// "General" (no se pierde nada); los de un canal privado se borran con él, porque en General los vería todo el equipo.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ channel: id, lead: true });
  if ("error" in auth) return auth.error;
  try {
    const ch = await prisma.chatChannel.findUnique({ where: { id }, select: { kind: true, workspaceId: true, members: { where: { userId: auth.user.id }, select: { id: true } } } });
    if (!ch) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (ch.kind !== "CUSTOM" && ch.kind !== "PRIVATE") return NextResponse.json({ error: "Ese canal no se borra" }, { status: 400 });
    // Un canal privado solo lo borra quien está dentro (un líder que no es miembro no debe poder ni tocarlo).
    if (ch.kind === "PRIVATE" && ch.members.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (ch.kind === "PRIVATE") {
      await prisma.$transaction([prisma.chatMessage.deleteMany({ where: { channelId: id } }), prisma.chatChannel.delete({ where: { id } })]);
      return NextResponse.json({ ok: true });
    }
    const general = (await ensureChannels(ch.workspaceId)).find((c) => c.kind === "GENERAL");
    await prisma.$transaction([
      prisma.chatMessage.updateMany({ where: { channelId: id }, data: { channelId: general?.id ?? null } }),
      prisma.chatChannel.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// Cambia quién está en un canal privado (solo un líder que ya esté dentro).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ channel: id, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ memberIds: z.array(z.string().min(1).max(40)).max(60) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const ch = await prisma.chatChannel.findUnique({ where: { id }, select: { kind: true, workspaceId: true, members: { select: { userId: true } } } });
    if (!ch || ch.kind !== "PRIVATE" || !ch.members.some((m) => m.userId === auth.user.id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const valid = await prisma.membership.findMany({ where: { workspaceId: ch.workspaceId, userId: { in: parsed.data.memberIds } }, select: { userId: true } });
    const next = new Set([auth.user.id, ...valid.map((v) => v.userId)]);
    if (next.size < 2) return NextResponse.json({ error: "El canal necesita al menos otra persona" }, { status: 400 });
    const current = new Set(ch.members.map((m) => m.userId));
    await prisma.$transaction([
      prisma.chatChannelMember.deleteMany({ where: { channelId: id, userId: { notIn: [...next] } } }),
      prisma.chatChannelMember.createMany({ data: [...next].filter((u) => !current.has(u)).map((userId) => ({ channelId: id, userId })) }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
