import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { markChannelRead } from "@/lib/chatChannels";

// Marca un canal como leído (hasta este momento) para la persona.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ channelId: z.string().min(1).max(40) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const cleared = await markChannelRead(auth.user.workspaceId!, auth.user.id, parsed.data.channelId);
    if (cleared === null) return NextResponse.json({ error: "Ese canal no existe" }, { status: 404 });
    return NextResponse.json({ ok: true, cleared });
  } catch (e) {
    return errorResponse(e);
  }
}
