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
  "extension/", // la extensión de Meet: token propio (scope EXTENSION) y equipo comprobado dentro de cada ruta
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

// Next.js solo admite exportar los métodos HTTP y unas pocas opciones desde un route.ts: cualquier otro export hace fallar
// la compilación de producción ("is not a valid Route export field"), aunque `tsc` y las pruebas pasen.
describe("route.ts solo exporta lo que Next.js permite", () => {
  const ALLOWED = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration"]);
  for (const file of routes(ROOT)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    it(`/api/${rel}`, () => {
      const src = readFileSync(file, "utf8");
      const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)].map((m) => m[1]);
      const braces = [...src.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(",").map((x) => (x.split(/\s+as\s+/).pop() ?? "").trim()).filter(Boolean));
      const bad = [...names, ...braces].filter((n) => !ALLOWED.has(n));
      expect(bad, "exports no permitidos en un route.ts (muévelos a src/lib)").toEqual([]);
    });
  }
});
