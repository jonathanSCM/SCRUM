// Archivos y enlaces del proyecto: etiquetas y enlaces (código puro).

export const MAX_RESOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_TAGS = 10;

// Etiquetas limpias: sin espacios sobrantes, sin repetidas (sin importar mayúsculas), máximo 10 de 30 caracteres.
export function normalizeTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function parseTags(raw: string | null | undefined): string[] {
  try {
    return normalizeTags(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
}

// Solo enlaces web (http/https).
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : "";
  if (!withScheme || /\s/.test(withScheme)) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// De qué servicio es un enlace (para mostrar "Drive", "Figma"…).
export function linkService(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Enlace";
  }
  if (host === "drive.google.com" || host === "docs.google.com" || host.endsWith(".google.com") && /^(sheets|slides|forms)\./.test(host)) return "Google Drive";
  if (host.endsWith("figma.com")) return "Figma";
  if (host.endsWith("notion.so") || host.endsWith("notion.site")) return "Notion";
  if (host.endsWith("github.com")) return "GitHub";
  if (host.endsWith("dropbox.com")) return "Dropbox";
  if (host.endsWith("onedrive.live.com") || host.endsWith("sharepoint.com") || host === "1drv.ms") return "OneDrive";
  return host;
}
