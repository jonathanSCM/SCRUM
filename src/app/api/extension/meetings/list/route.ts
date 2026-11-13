import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authExtension, resolveTeam } from "@/lib/extensionAuth";

// Reuniones del calendario del equipo, para elegir a cuál pertenece lo que se graba.
// ?scope=upcoming|all &skip= &q= &organizationId=
export async function GET(req: Request) {
  const user = await authExtension(req);
  if (!user) return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
  const url = new URL(req.url);
  const team = await resolveTeam(user.id, url.searchParams.get("organizationId"));
  if (!team) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);
  const q = (url.searchParams.get("q") ?? "").trim();
  const upcoming = url.searchParams.get("scope") !== "all";
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const take = 25;
  const where = { workspaceId: team.id, status: "SCHEDULED", ...(upcoming ? { startsAt: { gte: new Date(dayStart.getTime() - 12 * 3600_000) } } : {}), ...(q ? { title: { contains: q } } : {}) };
  const rows = await prisma.meeting.findMany({ where, orderBy: { startsAt: upcoming ? "asc" : "desc" }, skip, take: take + 1, select: { id: true, title: true, startsAt: true, meetUrl: true, status: true, project: { select: { name: true } }, _count: { select: { recordings: true } } } });
  return NextResponse.json(
    { meetings: rows.slice(0, take).map((m) => ({ id: m.id, title: m.title, client: m.project?.name ?? null, scheduledAt: m.startsAt.toISOString(), status: "SCHEDULED", meetingUrl: m.meetUrl, hasTranscript: m._count.recordings > 0 })), hasMore: rows.length > take },
    { headers: { "Cache-Control": "no-store" } }
  );
}
