import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { KIND_META, isKind } from "@/lib/scrum/notifPolicy";

// Bandeja de avisos de la propia persona.
export async function GET(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const q = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 40) || 40));
  try {
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: auth.user.id, ...(q.get("unread") === "1" ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.notification.count({ where: { userId: auth.user.id, readAt: null } }),
    ]);
    return NextResponse.json(
      {
        unread,
        items: rows.map((r) => ({ id: r.id, kind: r.kind, label: isKind(r.kind) ? KIND_META[r.kind].label : r.kind, title: r.title, body: r.body, url: r.url, count: r.count, priority: r.priority, createdAt: r.createdAt, readAt: r.readAt, pending: r.deliveredAt === null })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
