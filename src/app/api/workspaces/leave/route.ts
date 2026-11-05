import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canRemoveOrDemote } from "@/lib/scrum/roles";

// Salir del equipo activo. El único dueño no puede irse sin nombrar a otro. La cuenta se conserva.
export async function POST() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const workspaceId = auth.user.workspaceId!;
  try {
    const owners = await prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
    if (!canRemoveOrDemote(owners, auth.user.wsRole ?? "MEMBER")) {
      return NextResponse.json({ error: "Sos el único dueño: nombrá a otro dueño antes de salir." }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.task.updateMany({ where: { assigneeUserId: auth.user.id, project: { workspaceId } }, data: { assigneeUserId: null } }),
      prisma.membership.deleteMany({ where: { userId: auth.user.id, workspaceId } }),
    ]);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete("ws");
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
