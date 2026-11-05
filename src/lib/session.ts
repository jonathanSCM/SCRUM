import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { resolveApiToken } from "@/lib/apiToken";
import { activeAccess, membershipOf, workspaceOfResource, type Access, type ResourceKind } from "@/lib/workspace";
import type { WsRole } from "@/lib/scrum/roles";

// `role` es el rol DENTRO DEL EQUIPO del recurso que se está tocando ("LEAD" = dueño o admin
// de ese equipo). Nunca es un rol global: una misma persona puede ser líder en un equipo y
// miembro en otro.
export type SessionUser = { id: string; name: string; email: string; role: "LEAD" | "MEMBER"; workspaceId?: string; wsRole?: WsRole };

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return session;
}

// ---------------- Páginas (componentes de servidor) ----------------

export type PageAccess = Access & { session: Awaited<ReturnType<typeof requireSession>>; isLead: boolean };

// Páginas del equipo activo (inicio, proyectos, chat, equipo…).
export async function requireWorkspace(): Promise<PageAccess> {
  const session = await requireSession();
  const access = await activeAccess(session.user.id);
  if (!access) redirect("/no-team");
  return { ...access, session, isLead: access.legacyRole === "LEAD" };
}

// Páginas de un recurso (proyecto…): el equipo sale del recurso y se comprueba la membresía.
// Si no existe o es de otro equipo, la respuesta es la misma: "no encontrado".
export async function requireAccessTo(kind: ResourceKind, id: string): Promise<PageAccess> {
  const session = await requireSession();
  const workspaceId = await workspaceOfResource(kind, id);
  const access = workspaceId ? await membershipOf(session.user.id, workspaceId) : null;
  if (!access) notFound();
  return { ...access, session, isLead: access.legacyRole === "LEAD" };
}

export async function requireLead() {
  const access = await requireWorkspace();
  if (!access.isLead) redirect("/projects");
  return access.session;
}

// ---------------- API ----------------

type Scope = Partial<Record<ResourceKind, string>> & { workspace?: boolean };
export type ApiOptions = Scope & { lead?: boolean };

const SCOPE_KINDS: ResourceKind[] = ["project", "issue", "sprint", "comment", "attachment", "note", "retro", "contact", "projectMessage", "chatMessage", "chatFile", "status"];

const unauthorized = () => ({ error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) });
const notFoundRes = () => ({ error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) });

// Para las rutas de la API: devuelve la persona (con su rol en el equipo del recurso) o la
// respuesta de error lista para retornar.
//
//   apiUser({ project: id })    el proyecto `id` (y su equipo)
//   apiUser({ issue: id })      idem para ticket, sprint, comment, attachment, note, retro, contact, …
//   apiUser({ workspace: true }) listas y altas: el equipo activo de la persona
//   apiUser()                   solo identidad (perfil propio, notificaciones): sin datos de equipos
//
// Con `lead: true` se exige ser dueño o admin del equipo del recurso.
export async function apiUser(options: ApiOptions = {}): Promise<{ user: SessionUser } | { error: NextResponse }> {
  // 1) ¿Quién es? Token IA ("Authorization: Bearer …") o sesión de navegador.
  const h = await headers();
  const authz = h.get("authorization");
  let identity: { id: string; name: string; email: string } | null = null;
  let tokenWorkspace: string | null | undefined; // undefined = no es token

  if (authz && /^bearer\s/i.test(authz)) {
    const owner = await resolveApiToken(authz.replace(/^bearer\s+/i, "").trim(), h.get("x-token-route"));
    if (!owner) return { error: NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 }) };
    identity = { id: owner.id, name: owner.name, email: owner.email };
    tokenWorkspace = owner.workspaceId;
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized();
    identity = { id: session.user.id, name: session.user.name ?? "", email: session.user.email ?? "" };
  }

  // 2) ¿De qué equipo es lo que pide?
  const scopedKind = SCOPE_KINDS.find((k) => options[k] !== undefined);
  const needsWorkspace = !!scopedKind || options.workspace || options.lead;
  if (!needsWorkspace) return { user: { ...identity, role: "MEMBER" } };

  let workspaceId: string | null = null;
  if (scopedKind) {
    workspaceId = await workspaceOfResource(scopedKind, options[scopedKind] as string);
  } else if (tokenWorkspace !== undefined) {
    workspaceId = tokenWorkspace;
  } else {
    workspaceId = (await activeAccess(identity.id))?.workspaceId ?? null;
  }
  if (!workspaceId) return notFoundRes();
  // Un token solo vale dentro de su equipo.
  if (tokenWorkspace !== undefined && workspaceId !== tokenWorkspace) return notFoundRes();

  // 3) ¿Es miembro de ese equipo? Si no, el recurso "no existe" para esta persona.
  const access = await membershipOf(identity.id, workspaceId);
  if (!access) return notFoundRes();
  if (options.lead && access.legacyRole !== "LEAD") {
    return { error: NextResponse.json({ error: "Solo un líder puede hacer esto" }, { status: 403 }) };
  }
  return { user: { ...identity, role: access.legacyRole, workspaceId, wsRole: access.role } };
}
