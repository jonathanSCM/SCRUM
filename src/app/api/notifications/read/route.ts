import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";

// Marca como leídos (todos o algunos). Solo toca los avisos de la propia persona.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ all: z.boolean().optional(), ids: z.array(z.string().min(1).max(40)).max(200).optional() }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const where = parsed.data.all ? { userId: auth.user.id, readAt: null } : { userId: auth.user.id, id: { in: parsed.data.ids ?? [] }, readAt: null };
    const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    return NextResponse.json({ ok: true, marked: r.count });
  } catch (e) {
    return errorResponse(e);
  }
}
