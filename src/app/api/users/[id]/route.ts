import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canRemoveOrDemote, normalizeRole } from "@/lib/scrum/roles";

// Saca a una persona del equipo activo. Si no le queda ningún otro equipo, se borra la cuenta.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const workspaceId = auth.user.workspaceId!;

  try {
    const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: id, workspaceId } } });
    if (!membership) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const targetRole = normalizeRole(membership.role);

    // Solo el dueño puede sacar a otro dueño, y nunca se deja el equipo sin dueño.
    if (targetRole === "OWNER" && auth.user.wsRole !== "OWNER") {
      return NextResponse.json({ error: "Solo un dueño puede sacar a otro dueño" }, { status: 403 });
    }
    const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
    if (!canRemoveOrDemote(owners, targetRole)) {
      return NextResponse.json({ error: "No podés sacar al único dueño del equipo" }, { status: 400 });
    }

    const remaining = await prisma.membership.count({ where: { userId: id, workspaceId: { not: workspaceId } } });
    await prisma.$transaction([
      // Sus tickets en este equipo quedan sin responsable.
      prisma.task.updateMany({ where: { assigneeUserId: id, project: { workspaceId } }, data: { assigneeUserId: null } }),
      prisma.membership.delete({ where: { id: membership.id } }),
      ...(remaining === 0 ? [prisma.user.delete({ where: { id } })] : []),
    ]);
    return NextResponse.json({ ok: true, accountDeleted: remaining === 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
