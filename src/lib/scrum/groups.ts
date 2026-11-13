// Grupos de tareas (código puro, con tests): tareas sueltas que todavía no son un proyecto.

export const GROUP_KIND = "GROUP";
export const PROJECT_KIND = "PROJECT";

export type GroupAccessInfo = { kind: string; isPrivate: boolean; ownerId: string | null; memberIds: string[] };

// ¿Puede esta persona abrir el proyecto o grupo? Los proyectos son de todo el equipo; un grupo privado,
// solo de quien lo creó y de las personas con acceso.
export function canSeeProject(p: GroupAccessInfo, userId: string): boolean {
  if (p.kind !== GROUP_KIND || !p.isPrivate) return true;
  return p.ownerId === userId || p.memberIds.includes(userId);
}

// Filtro de Prisma: proyectos y grupos del equipo que esta persona puede ver.
export function visibleProjectWhere(userId: string, workspaceId: string) {
  return { workspaceId, OR: [{ isPrivate: false }, { ownerId: userId }, { members: { some: { userId } } }] };
}
