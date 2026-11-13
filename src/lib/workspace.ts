import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { normalizeRole, toLegacyRole, type WsRole } from "@/lib/scrum/roles";
import { canSeeProject } from "@/lib/scrum/groups";

// Capa de acceso a equipos. TODA lectura o escritura de datos de un equipo pasa por acá:
//   1. se resuelve a qué equipo pertenece el recurso (o cuál es el equipo activo),
//   2. se comprueba que la persona es miembro de ESE equipo,
//   3. se devuelve su rol en ese equipo.
// Si el recurso no existe o es de un equipo ajeno, la respuesta es la misma ("no existe"):
// así no se puede averiguar qué hay en otros equipos.

export const ACTIVE_WS_COOKIE = "ws";

export type Access = { workspaceId: string; role: WsRole; legacyRole: "LEAD" | "MEMBER" };

export async function membershipOf(userId: string, workspaceId: string): Promise<Access | null> {
  const m = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, select: { role: true } });
  if (!m) return null;
  const role = normalizeRole(m.role);
  return { workspaceId, role, legacyRole: toLegacyRole(role) };
}

// Equipo activo de la persona: el de la cookie si sigue siendo miembro; si no, el más antiguo al que pertenece.
export async function activeAccess(userId: string): Promise<Access | null> {
  try {
    const wanted = (await cookies()).get(ACTIVE_WS_COOKIE)?.value;
    if (wanted) {
      const a = await membershipOf(userId, wanted);
      if (a) return a;
    }
  } catch {
    // fuera de una petición (scripts, pruebas): se ignora la cookie
  }
  const first = await prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, role: true } });
  if (!first) return null;
  const role = normalizeRole(first.role);
  return { workspaceId: first.workspaceId, role, legacyRole: toLegacyRole(role) };
}

// ---- A qué equipo pertenece cada tipo de recurso ----
// Un solo lugar: si se agrega un tipo de recurso nuevo, se agrega acá.

export type ResourceKind =
  | "project"
  | "issue"
  | "sprint"
  | "comment"
  | "attachment"
  | "note"
  | "retro"
  | "contact"
  | "projectMessage"
  | "chatMessage"
  | "chatFile"
  | "status"
  | "invitation"
  | "channel"
  | "resource"
  | "fileCard"
  | "fileCardItem"
  | "meeting"
  | "recording";

const projectScope = { workspaceId: true, kind: true, isPrivate: true, ownerId: true, members: { select: { userId: true } } } as const;
const viaProject = { select: { project: { select: projectScope } } } as const;
type ProjectScope = { workspaceId: string | null; kind: string; isPrivate: boolean; ownerId: string | null; members: Array<{ userId: string }> };

// Equipo de un proyecto (o de un recurso suyo). Si se indica quién mira y es un grupo privado al que no tiene acceso,
// el recurso "no existe" para esa persona (null → 404).
function scopeOf(p: ProjectScope | null | undefined, viewerId?: string): string | null {
  if (!p) return null;
  if (viewerId && !canSeeProject({ kind: p.kind, isPrivate: p.isPrivate, ownerId: p.ownerId, memberIds: p.members.map((m) => m.userId) }, viewerId)) return null;
  return p.workspaceId ?? null;
}

export async function workspaceOfResource(kind: ResourceKind, id: string, viewerId?: string): Promise<string | null> {
  switch (kind) {
    case "project":
      return scopeOf(await prisma.project.findUnique({ where: { id }, select: projectScope }), viewerId);
    case "issue":
      return scopeOf((await prisma.task.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "sprint":
      return scopeOf((await prisma.sprint.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "comment":
      return scopeOf((await prisma.comment.findUnique({ where: { id }, select: { task: viaProject } }))?.task.project, viewerId);
    case "attachment":
      return scopeOf((await prisma.attachment.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "note":
      return scopeOf((await prisma.note.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "retro":
      return scopeOf((await prisma.retroItem.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "contact":
      return scopeOf((await prisma.projectContact.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "projectMessage":
      return scopeOf((await prisma.projectMessage.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "chatMessage":
      return (await prisma.chatMessage.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "chatFile":
      return (await prisma.chatFile.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "fileCard":
      return (await prisma.fileCard.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "fileCardItem":
      return (await prisma.fileCardItem.findUnique({ where: { id }, select: { card: { select: { workspaceId: true } } } }))?.card.workspaceId ?? null;
    case "resource":
      return scopeOf((await prisma.projectResource.findUnique({ where: { id }, ...viaProject }))?.project, viewerId);
    case "channel":
      return (await prisma.chatChannel.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "invitation":
      return (await prisma.invitation.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "meeting":
      return (await prisma.meeting.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "recording":
      return (await prisma.meetingRecording.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
    case "status":
      return (await prisma.statusOption.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId ?? null;
  }
}

// Personas de un equipo (reemplaza a prisma.user.findMany() sin filtro).
export async function membersOf(workspaceId: string) {
  const rows = await prisma.membership.findMany({
    where: { workspaceId },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => ({ ...r.user, wsRole: normalizeRole(r.role) }));
}

export async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  return (await prisma.membership.count({ where: { userId, workspaceId } })) > 0;
}

// Equipos que comparten dos personas (para mostrar la marca de rol solo donde corresponde).
export async function sharedWorkspaces(viewerId: string, otherId: string) {
  const rows = await prisma.membership.findMany({
    where: { userId: otherId, workspace: { members: { some: { userId: viewerId } } } },
    select: { role: true, workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ workspaceId: r.workspace.id, workspaceName: r.workspace.name, role: normalizeRole(r.role) }));
}
