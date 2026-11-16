// Nombre de un documento de Google Drive a partir de su enlace (código puro, con tests).

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com", "sheets.google.com", "slides.google.com", "forms.google.com"]);

// Solo estos sitios se consultan desde el servidor (nunca una dirección cualquiera que pegue la persona).
export function isDriveUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && DRIVE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
export const isDriveHost = (host: string) => DRIVE_HOSTS.has(host);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Páginas genéricas que Google devuelve cuando el documento es privado (no sirven como nombre).
const GENERIC = /^(google( drive| docs| sheets| slides| forms| accounts| cuentas)?|drive|docs|sign in|iniciar sesi[oó]n|inicia sesi[oó]n|acceso|error|not found|404|no se encontr[oó].*|temporarily unavailable|documentos de google|hojas de c[aá]lculo de google|presentaciones de google|formularios de google)$/i;
const SUFFIX = /\s+[-–—]\s+(google\s+(drive|docs|sheets|slides|forms|accounts|cuentas)|(documentos|hojas de c[aá]lculo|presentaciones|formularios) de google|google\s+drive)\s*$/i;

// "Plan de trabajo - Google Docs" → "Plan de trabajo". Si queda algo genérico o vacío, null.
export function cleanDriveTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  t = t.replace(SUFFIX, "").trim();
  if (!t || GENERIC.test(t)) return null;
  return t.slice(0, 200);
}

// Saca el nombre del HTML de la página: primero og:title, si no <title>.
export function parseDocTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  const fromOg = cleanDriveTitle(og?.[1]);
  if (fromOg) return fromOg;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return cleanDriveTitle(title?.[1]);
}
