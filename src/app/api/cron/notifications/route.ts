import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { flushNotifications } from "@/lib/notifications";
import { flushProjectFeeds } from "@/lib/notify";
import { flushMeetingReminders } from "@/lib/meetings";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Envía los resúmenes pendientes (personas y canales de proyecto) y limpia avisos viejos. Se puede llamar desde una tarea
// programada de Coolify cada minuto: POST /api/cron/notifications con "Authorization: Bearer <CRON_SECRET>".
// (El servidor también lo hace solo cada minuto; esto es un respaldo y permite forzarlo.)
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const now = new Date();
  const [people, feeds, reminders] = await Promise.all([flushNotifications(now), flushProjectFeeds(now), flushMeetingReminders(now)]);
  // Limpieza: leídos de más de 60 días y todo lo de más de 120 días.
  const cleaned = await prisma.notification.deleteMany({ where: { OR: [{ readAt: { lt: new Date(now.getTime() - 60 * 86400_000) } }, { createdAt: { lt: new Date(now.getTime() - 120 * 86400_000) } }], deliveredAt: { not: null } } }).catch(() => ({ count: 0 }));
  await prisma.projectFeedItem.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } }).catch(() => null);
  return NextResponse.json({ ok: true, people, feeds, reminders, cleaned: cleaned.count });
}

export const POST = run;
export const GET = run;
