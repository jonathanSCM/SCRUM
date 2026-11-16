import "server-only";
import { isDriveHost, isDriveUrl, parseDocTitle } from "@/lib/scrum/driveTitle";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

// Trae el nombre de un documento de Google Drive/Docs/Sheets/Slides leyendo su página pública (sin cuenta de Google).
// Solo funciona con los enlaces que cualquiera con el enlace puede abrir; si el documento es privado, o Google no
// contesta a tiempo, devuelve null y el nombre se escribe a mano. Solo consulta sitios de Google (nunca una dirección
// arbitraria) y nunca sigue una redirección fuera de ellos.
export async function fetchDriveTitle(raw: string): Promise<string | null> {
  if (!isDriveUrl(raw)) return null;
  try {
    let current = new URL(raw);
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      // Solo para pruebas: un servidor local que hace de Google.
      const mock = process.env.DRIVE_TITLE_BASE_URL;
      const target = mock ? new URL(`${current.pathname}${current.search}`, mock) : current;
      const res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "Accept-Language": "es,en;q=0.8", Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; SCRUMProShop/1.0; +link-title)" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        const next = new URL(loc, current);
        if (!isDriveHost(next.hostname) || next.protocol !== "https:") return null; // p. ej. accounts.google.com: es privado
        current = next;
        continue;
      }
      if (!res.ok || !res.body) return null;
      // Se lee solo el comienzo de la página (el nombre está en <head>).
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
        if (/<\/head>/i.test(Buffer.concat(chunks).toString("utf8").slice(-2000))) break;
      }
      void reader.cancel().catch(() => {});
      return parseDocTitle(Buffer.concat(chunks).toString("utf8"));
    }
    return null;
  } catch {
    return null;
  }
}
