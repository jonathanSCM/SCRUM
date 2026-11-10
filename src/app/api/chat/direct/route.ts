import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { openDirect } from "@/lib/chatChannels";
import { parseBody, readJson } from "@/lib/validation";

// Abre (o crea) el mensaje directo con otra persona del equipo. Cualquiera puede escribir a cualquiera de su equipo.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ userId: z.string().min(1).max(40) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const workspaceId = auth.user.workspaceId!;
    if (parsed.data.userId === auth.user.id) return NextResponse.json({ error: "No puedes escribirte a ti mismo" }, { status: 400 });
    const peer = await prisma.membership.findFirst({ where: { workspaceId, userId: parsed.data.userId }, select: { userId: true } });
    if (!peer) return NextResponse.json({ error: "Esa persona no es de tu equipo" }, { status: 404 });
    return NextResponse.json({ id: await openDirect(workspaceId, auth.user.id, peer.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}
