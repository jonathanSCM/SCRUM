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

const DRIVE_ID = "[A-Za-z0-9_-]{10,}";

// Nombre amable para un enlace sin título (sin consultar la red).
export function friendlyTitle(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.slice(0, 120);
  }
  const p = u.pathname;
  if (u.hostname === "docs.google.com") {
    if (p.startsWith("/document/")) return "Documento de Google";
    if (p.startsWith("/spreadsheets/")) return "Hoja de cálculo de Google";
    if (p.startsWith("/presentation/")) return "Presentación de Google";
    if (p.startsWith("/forms/")) return "Formulario de Google";
  }
  if (u.hostname === "drive.google.com") {
    if (/\/folders\//.test(p)) return "Carpeta de Google Drive";
    if (/\/file\//.test(p) || u.searchParams.has("id")) return "Archivo de Google Drive";
  }
  if (u.hostname.endsWith("figma.com")) return "Diseño en Figma";
  return (u.hostname.replace(/^www\./, "") + p.replace(/\/$/, "")).slice(0, 120);
}

// Dirección para mostrar el enlace dentro de la app (vista previa), o null si no se puede incrustar.
export function previewUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const p = u.pathname;
  if (u.hostname === "drive.google.com") {
    const file = p.match(new RegExp(`^/file/d/(${DRIVE_ID})`));
    if (file) return `https://drive.google.com/file/d/${file[1]}/preview`;
    const folder = p.match(new RegExp(`^/drive/(?:u/\\\\d+/)?folders/(${DRIVE_ID})`));
    if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`;
    return null;
  }
  if (u.hostname === "docs.google.com") {
    const doc = p.match(new RegExp(`^/(document|spreadsheets|presentation)/d/(${DRIVE_ID})`));
    if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
    return null;
  }
  if (u.hostname.endsWith("figma.com") && /^\/(file|design|proto|board)\//.test(p)) return `https://www.figma.com/embed?embed_host=scrum-proshop&url=${encodeURIComponent(url)}`;
  return null;
}
