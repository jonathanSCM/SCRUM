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
