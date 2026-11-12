// Versión de la app y "borrar caché de todos": el servidor dice qué versión está desplegada (build) y qué "versión de
// caché" fijó quien administra la plataforma (variable CACHE_VERSION). Cada navegador compara con lo que tiene.

export type VersionAction = "none" | "remember" | "purge-reload" | "purge-banner" | "banner";

export function decideVersionAction(i: { storedCache: string | null; serverCache: string; serverBuild: string; clientBuild: string; typing: boolean }): VersionAction {
  // La "versión de caché" cambió (alguien la subió a propósito): se limpia todo y se recarga.
  if (i.storedCache !== null && i.storedCache !== i.serverCache) return i.typing ? "purge-banner" : "purge-reload";
  // Hay una versión nueva desplegada: se avisa con un botón (no se recarga solo para no perder lo que se escribe).
  if (i.serverBuild && i.clientBuild && i.serverBuild !== i.clientBuild) return "banner";
  // Primera vez en este navegador: solo se recuerda la versión de caché.
  if (i.storedCache === null) return "remember";
  return "none";
}
