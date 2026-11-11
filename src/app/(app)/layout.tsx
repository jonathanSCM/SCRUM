import Navbar from "@/components/Navbar";
import { PushAutoPrompt } from "@/components/PwaControls";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { maxOwnedTeams, normalizeRole } from "@/lib/scrum/roles";

// Todas las pantallas con sesión comparten la barra superior (con el selector de equipo).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, isLead, workspaceId } = await requireWorkspace();
  const rows = await prisma.membership.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, select: { role: true, workspace: { select: { id: true, name: true } } } });
  const teams = rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: normalizeRole(r.role) }));
  const maxOwned = maxOwnedTeams(process.env.MAX_OWNED_TEAMS);
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        userName={session.user.name ?? session.user.email ?? ""}
        userId={session.user.id}
        isLead={isLead}
        teams={teams}
        activeId={workspaceId}
        canCreate={teams.filter((t) => t.role === "OWNER").length < maxOwned}
        maxOwned={maxOwned}
      />
      <div className="flex-1">{children}</div>
      <PushAutoPrompt />
    </div>
  );
}
