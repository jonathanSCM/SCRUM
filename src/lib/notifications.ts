import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/baseUrl";
import { sendPush } from "@/lib/push";
import { ASSIGN_BATCH_MINUTES, CHAT_BATCH_KINDS, CHAT_BATCH_MINUTES, KIND_META, digestMessage, foldsIntoRecent, normalizePrefs, planDelivery, type NoticeKind, type Prefs } from "@/lib/scrum/notifPolicy";
import type { NtfyPriority } from "@/lib/scrum/ntfyFormat";

// Avisos a personas: todo queda en su bandeja; llega al navegador/teléfono al instante, en un resumen o no llega,
// según el tipo de aviso y sus preferencias (ver notifPolicy.ts). NUNCA lanza.

export type Notice = { kind: NoticeKind; title: string; body?: string; url?: string; priority?: NtfyPriority; groupKey?: string; workspaceId?: string | null; foldRecent?: boolean };

const PRIORITY_NAME: Record<NtfyPriority, string> = { low: "low", default: "default", high: "high", urgent: "urgent" };

export async function loadPrefs(userIds: string[]): Promise<Map<string, Prefs>> {
  const rows = await prisma.notifPrefs.findMany({ where: { userId: { in: userIds } } });
  const out = new Map<string, Prefs>();
  for (const id of userIds) {
    const r = rows.find((x) => x.userId === id);
    let muted: string[] = [];
    try { muted = r ? JSON.parse(r.muted) : []; } catch {}
    out.set(id, normalizePrefs(r ? { digestMinutes: r.digestMinutes, quietEnabled: r.quietEnabled, quietStart: r.quietStart, quietEnd: r.quietEnd, tz: r.tz, muted } : null));
  }
  return out;
}

export async function notifyUsers(userIds: Array<string | null | undefined>, notice: Notice, now: Date = new Date()): Promise<number> {
  try {
    const ids = [...new Set(userIds.filter((u): u is string => !!u))];
    if (ids.length === 0) return 0;
    const prefs = await loadPrefs(ids);
    const instant: string[] = [];
    for (const userId of ids) {
      const p = prefs.get(userId)!;
      const recentAssigned = notice.kind === "ASSIGNED" ? await prisma.notification.count({ where: { userId, kind: "ASSIGNED", createdAt: { gt: new Date(now.getTime() - ASSIGN_BATCH_MINUTES * 60_000) } } }) : 0;
      const plan = planDelivery(notice.kind, now, p, { recentAssigned });
      const base = { userId, kind: notice.kind, title: notice.title.slice(0, 200), body: (notice.body ?? "").slice(0, 600), url: notice.url ?? null, priority: PRIORITY_NAME[notice.priority ?? "default"], groupKey: notice.groupKey ?? null, workspaceId: notice.workspaceId ?? null };
      if (plan.tier === "silent") {
        await prisma.notification.create({ data: { ...base, deliveredAt: now, pushed: false } });
      } else if (plan.tier === "instant") {
        // Varios mensajes de chat seguidos: se suman al aviso que ya sonó, sin volver a sonar.
        const recent = notice.foldRecent && notice.groupKey && CHAT_BATCH_KINDS.includes(notice.kind)
          ? await prisma.notification.findFirst({ where: { userId, kind: notice.kind, groupKey: notice.groupKey, deliveredAt: { gt: new Date(now.getTime() - CHAT_BATCH_MINUTES * 60_000) } }, orderBy: { deliveredAt: "desc" } })
          : null;
        if (recent && foldsIntoRecent(notice.kind, notice.groupKey, recent.deliveredAt, now)) {
          await prisma.notification.update({ where: { id: recent.id }, data: { count: recent.count + 1, title: base.title, body: base.body, url: base.url, createdAt: now, readAt: null } });
        } else {
          await prisma.notification.create({ data: { ...base, deliveredAt: now, pushed: true } });
          instant.push(userId);
        }
      } else {
        // Se junta con un pendiente igual (mismo ticket y tipo) y comparte la ventana del primer pendiente.
        const same = notice.groupKey ? await prisma.notification.findFirst({ where: { userId, kind: notice.kind, groupKey: notice.groupKey, deliveredAt: null } }) : null;
        if (same) {
          await prisma.notification.update({ where: { id: same.id }, data: { count: same.count + 1, title: base.title, body: base.body, createdAt: now, readAt: null } });
        } else {
          const first = plan.reason === "quiet" ? null : await prisma.notification.findFirst({ where: { userId, deliveredAt: null, deliverAfter: { not: null } }, orderBy: { deliverAfter: "asc" }, select: { deliverAfter: true } });
          const deliverAfter = first?.deliverAfter && first.deliverAfter < plan.deliverAfter ? first.deliverAfter : plan.deliverAfter;
          await prisma.notification.create({ data: { ...base, deliverAfter } });
        }
      }
    }
    // Los instantáneos salen ya, cada uno con su propio aviso.
    if (instant.length) {
      const url = notice.url ? (/^https?:\/\//.test(notice.url) ? notice.url : notice.url) : "/notifications";
      await sendPush(instant, { title: notice.title, body: notice.body ?? "", url, tag: notice.groupKey ?? notice.kind.toLowerCase(), priority: notice.priority });
    }
    return ids.length;
  } catch (err) {
    console.error("[avisos] no se pudo registrar el aviso:", err);
    return 0;
  }
}

// Envía los resúmenes que ya cumplieron su ventana (un solo aviso por persona). Seguro de llamar varias veces o
// desde varios procesos a la vez: cada pendiente se "reclama" una sola vez.
export async function flushNotifications(now: Date = new Date()): Promise<{ users: number; items: number }> {
  let users = 0;
  let items = 0;
  try {
    const due = await prisma.notification.findMany({ where: { deliveredAt: null, deliverAfter: { lte: now } }, select: { userId: true }, distinct: ["userId"], take: 500 });
    for (const { userId } of due) {
      const rows = await prisma.notification.findMany({ where: { userId, deliveredAt: null, deliverAfter: { lte: now } }, orderBy: { createdAt: "asc" } });
      if (rows.length === 0) continue;
      const claimed = await prisma.notification.updateMany({ where: { id: { in: rows.map((r) => r.id) }, deliveredAt: null }, data: { deliveredAt: now, pushed: true } });
      if (claimed.count === 0) continue;
      const msg = digestMessage(rows.map((r) => ({ kind: r.kind as NoticeKind, title: r.title, count: r.count })));
      const only = rows.length === 1 ? rows[0] : null;
      const urgent = rows.some((r) => KIND_META[r.kind as NoticeKind]?.tier === "instant");
      await sendPush([userId], { title: msg.title, body: only && only.body ? only.body : msg.body, url: only?.url ?? "/notifications", tag: "resumen", priority: urgent ? "high" : "default" });
      users++;
      items += claimed.count;
    }
  } catch (err) {
    console.error("[avisos] error al enviar resúmenes:", err);
  }
  return { users, items };
}

export const inboxUrl = () => `${getBaseUrl()}/notifications`;
