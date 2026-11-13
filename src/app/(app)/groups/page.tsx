import { requireWorkspace } from "@/lib/session";
import { membersOf } from "@/lib/workspace";
import { listGroups } from "@/lib/groups";
import GroupsView from "./GroupsView";

export const metadata = { title: "Grupos de tareas" };

// Tareas sueltas: grupos de tareas que no pertenecen a ningún proyecto (demos, ideas…). Se pueden convertir en proyecto.
export default async function GroupsPage() {
  const { session, workspaceId } = await requireWorkspace();
  const [active, archived, people] = await Promise.all([
    listGroups(session.user.id, workspaceId),
    listGroups(session.user.id, workspaceId, { archived: true }),
    membersOf(workspaceId).then((m) => m.filter((p) => p.id !== session.user.id).map(({ id, name }) => ({ id, name }))),
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Grupos de tareas</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink-soft">Tareas sueltas que todavía no son un proyecto: una demo, una lista de ideas, un pendiente del cliente. Agrúpalas aquí y, cuando crezcan, conviértelas en un proyecto con un clic.</p>
      <GroupsView active={active} archived={archived} people={people} />
    </main>
  );
}
