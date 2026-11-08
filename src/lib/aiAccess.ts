// Qué puede hacer un token IA. Lista cerrada: todo lo que no esté acá se rechaza
// (borrar, usuarios, estados, tokens, iniciar o completar sprints, ajustes…).
// Código puro: lo usa el middleware (edge) y las pruebas.

const ID = "[A-Za-z0-9_-]+";

const RULES: Array<{ method: string; path: RegExp }> = [
  // Lectura
  { method: "GET", path: new RegExp(`^/api/ai/(projects|users)(/${ID})?$`) },
  { method: "GET", path: new RegExp(`^/api/issues/by-key/[^/]+$`) },
  { method: "GET", path: /^\/api\/search$/ },
  { method: "GET", path: new RegExp(`^/api/projects/${ID}/export-json$`) },
  // Crear proyectos, sprints (sin iniciar), tickets y notas; mover; comentar
  { method: "POST", path: /^\/api\/ai\/import$/ },
  { method: "POST", path: /^\/api\/projects$/ },
  { method: "POST", path: new RegExp(`^/api/projects/${ID}/(issues|move|bulk|sprints|notes)$`) },
  { method: "POST", path: new RegExp(`^/api/issues/${ID}/comments$`) },
  { method: "POST", path: new RegExp(`^/api/notes/${ID}/tickets$`) },
  // Editar
  { method: "PATCH", path: new RegExp(`^/api/projects/${ID}$`) },
  { method: "PATCH", path: new RegExp(`^/api/issues/${ID}$`) },
  { method: "PATCH", path: new RegExp(`^/api/notes/${ID}$`) },
];

// Borrados que un token puede hacer SOLO si su dueño activó "permitir borrar" (se comprueba en apiUser,
// porque el middleware no consulta la base). Nunca proyectos, sprints, personas ni equipos.
const DELETE_RULES: RegExp[] = [new RegExp(`^/api/issues/${ID}$`), new RegExp(`^/api/notes/${ID}$`), new RegExp(`^/api/comments/${ID}$`)];

export function isDeletableByToken(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return method.toUpperCase() === "DELETE" && DELETE_RULES.some((r) => r.test(path));
}

export function isAllowedForToken(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return RULES.some((r) => r.method === method.toUpperCase() && r.path.test(path));
}
