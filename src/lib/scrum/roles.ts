// Roles por equipo (código puro, con tests).
//   OWNER  dueño: todo, incluida la facturación y borrar el equipo.
//   ADMIN  hace lo que antes hacía un "Líder" (integraciones, estados, personas).
//   MEMBER trabaja con proyectos, tickets, notas y chat.

export const WS_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type WsRole = (typeof WS_ROLES)[number];

export function isWsRole(value: string): value is WsRole {
  return (WS_ROLES as readonly string[]).includes(value);
}

// El resto de la app habla de "LEAD" o "MEMBER": un dueño o admin cuenta como LEAD en ese equipo.
export function toLegacyRole(role: WsRole): "LEAD" | "MEMBER" {
  return role === "MEMBER" ? "MEMBER" : "LEAD";
}

export const ROLE_LABEL: Record<WsRole, string> = { OWNER: "Dueño", ADMIN: "Admin", MEMBER: "Miembro" };

// "DUEÑO DE ProShop", "ADMIN DE …", "MIEMBRO DE …"
export function roleBadge(role: WsRole, workspaceName: string): string {
  return `${ROLE_LABEL[role].toUpperCase()} DE ${workspaceName}`;
}

// Pasa lo que viene de la base (texto libre) a un rol válido; ante la duda, el de menos permisos.
export function normalizeRole(value: string | null | undefined): WsRole {
  return value && isWsRole(value) ? value : "MEMBER";
}

// Rol que recibe una cuenta antigua al migrar: el dueño elegido es OWNER, los LEAD pasan a ADMIN.
export function migratedRole(legacy: "LEAD" | "MEMBER", isOwner: boolean): WsRole {
  return isOwner ? "OWNER" : legacy === "LEAD" ? "ADMIN" : "MEMBER";
}

// Una persona no puede dejar un equipo sin dueño: ¿se puede cambiar este rol / quitar esta persona?
export function canRemoveOrDemote(ownerCount: number, targetRole: WsRole): boolean {
  return targetRole !== "OWNER" || ownerCount > 1;
}

// Slug de equipo: minúsculas, sin acentos, solo letras, números y guiones.
export function slugify(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || "equipo";
}

export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---- Cambios de rol ----

export type RoleChange = { ok: true } | { ok: false; reason: string };

// ¿Puede `actor` pasar a `target` (que hoy tiene `current`) al rol `next`?
//  - Miembros no cambian roles.
//  - Solo un dueño nombra o quita dueños.
//  - Un admin mueve entre Admin y Miembro a quien no es dueño.
//  - Nunca se deja un equipo sin dueño.
export function canChangeRole(actor: WsRole, current: WsRole, next: WsRole, ownerCount: number): RoleChange {
  if (actor === "MEMBER") return { ok: false, reason: "Solo un dueño o un admin puede cambiar roles" };
  if (current === next) return { ok: true };
  if ((current === "OWNER" || next === "OWNER") && actor !== "OWNER") return { ok: false, reason: "Solo un dueño puede nombrar o quitar dueños" };
  if (current === "OWNER" && !canRemoveOrDemote(ownerCount, current)) return { ok: false, reason: "El equipo no puede quedarse sin dueño: nombrá primero a otro" };
  return { ok: true };
}

// ---- Invitaciones ----

export const INVITE_TTL_DAYS = 7;
export const INVITE_ROLES = ["ADMIN", "MEMBER"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export type InvitationState = "ok" | "expired" | "used" | "revoked";

export function invitationState(inv: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }, now: Date = new Date()): InvitationState {
  if (inv.revokedAt) return "revoked";
  if (inv.acceptedAt) return "used";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// Tope de equipos propios por cuenta (configurable con MAX_OWNED_TEAMS; por defecto 3).
export function maxOwnedTeams(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 3;
}
