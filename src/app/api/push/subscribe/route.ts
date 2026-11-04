import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
});

// Guarda (o reasigna al usuario actual) la suscripción de este dispositivo.
export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(subscribeSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { endpoint, keys } = parsed.data;

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: auth.user.id, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: auth.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ endpoint: z.string().url().max(1000) }), await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: auth.user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
