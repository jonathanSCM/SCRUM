import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guardia de seguridad multi-equipo: toda ruta de la API tiene que decir de qué equipo es lo que
// toca (apiUser({ project: id }), { workspace: true }, …) o estar en esta lista de rutas
// que solo trabajan con la identidad de la persona. Si alguien agrega una ruta nueva sin alcance,
// esta prueba falla y obliga a decidirlo.

const ROOT = join(__dirname, "../../app/api");

// Rutas "solo identidad": no leen ni escriben datos de equipos.
const IDENTITY_ONLY = [
  "app-version/", // versión desplegada de la app (pública, sin datos)
  "auth/", // login, registro de la primera cuenta, recuperar contraseña
  "invite/", // aceptar una invitación: se valida con el enlace secreto, sin sesión previa
  "push/", // suscripciones del navegador de la propia persona
  "ntfy/", // el canal de avisos al teléfono de la propia persona
  "notifications/", // bandeja y preferencias de avisos de la propia persona
  "cron/", // tareas programadas: se validan con CRON_SECRET
  "tokens/", // su propio token IA
  "users/me/", // su propio perfil
  "users/[id]/image/", // imágenes: la ruta comprueba por dentro que se comparte equipo
];

// Rutas exactas "solo identidad" de equipos: listar MIS equipos, crear uno propio y cambiar el equipo activo
// (esta última comprueba la membresía por dentro). El resto de /workspaces/* sí declara su equipo.
const IDENTITY_ONLY_EXACT = ["workspaces/", "workspaces/active/"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routes(full) : name === "route.ts" ? [full] : [];
  });
}

const SCOPE = /apiUser\(\{[^)]*\b(workspace|project|issue|sprint|comment|attachment|note|retro|contact|projectMessage|chatMessage|chatFile|status|invitation|channel|resource|fileCard|fileCardItem|meeting|recording)\b/;

describe("guardia de aislamiento entre equipos", () => {
  const files = routes(ROOT);
  it("hay rutas que revisar", () => expect(files.length).toBeGreaterThan(40));

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/").replace(/route\.ts$/, "");
    it(`/api/${rel}`, () => {
      const src = readFileSync(file, "utf8");
      if (IDENTITY_ONLY.some((p) => rel.startsWith(p)) || IDENTITY_ONLY_EXACT.includes(rel)) return;
      const calls = src.match(/apiUser\(/g) ?? [];
      expect(calls.length, "debe autenticar con apiUser(...)").toBeGreaterThan(0);
      const scoped = src.match(new RegExp(SCOPE.source, "g")) ?? [];
      expect(scoped.length, "cada apiUser(...) debe indicar el equipo del recurso").toBe(calls.length);
      // Nada de leer personas o proyectos de todo el sistema sin filtrar por equipo.
      expect(src, "prisma.user.findMany sin filtro de equipo").not.toMatch(/prisma\.user\.findMany\(\{\s*select/);
    });
  }
});
