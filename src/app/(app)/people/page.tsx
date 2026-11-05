import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { getPeople } from "@/lib/profileData";
import PeopleDirectory from "./PeopleDirectory";

export const metadata = { title: "Equipo" };

// Equipo: las personas del equipo activo con su perfil. Un líder, además, crea y borra cuentas desde acá.
export default async function TeamPage() {
  const { session, workspaceId, isLead } = await requireWorkspace();
  const [people, workspace] = await Promise.all([getPeople(workspaceId, { withEmail: isLead }), prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })]);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Equipo</h1>
      <p className="mb-6 text-sm text-ink-soft">
        {workspace?.name}. Haz clic en alguien para ver en qué proyectos está activo y qué hizo esta semana.
        {isLead && " Como líder también creas y borras cuentas: no hay invitación por email, se crea la cuenta con una contraseña temporal."}
      </p>
      <PeopleDirectory people={people} workspaceName={workspace?.name ?? ""} currentUserId={session.user.id} isLead={isLead} />
    </main>
  );
}
