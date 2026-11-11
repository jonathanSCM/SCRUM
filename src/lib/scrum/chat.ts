// Utilidades puras del chat general (marcas de referencia, enlaces, colores).

export const REF_KINDS = ["project", "issue", "sprint", "user", "card"] as const;
export type RefKind = (typeof REF_KINDS)[number];

const TOKEN_RE = /\[\[(project|issue|sprint|user|card):([a-z0-9]{8,40})\]\]/g;

export function makeToken(kind: RefKind, id: string): string {
  return `[[${kind}:${id}]]`;
}

export type ParsedRef = { kind: RefKind; id: string };

// Referencias de un texto (sin repetir).
export function parseRefs(body: string): ParsedRef[] {
  const seen = new Set<string>();
  const out: ParsedRef[] = [];
  for (const m of body.matchAll(TOKEN_RE)) {
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: m[1] as RefKind, id: m[2] });
  }
  return out;
}

export type Segment =
  | { type: "text"; text: string }
  | { type: "ref"; kind: RefKind; id: string }
  | { type: "link"; href: string; text: string };

// Solo http(s): nada de javascript: ni data:.
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;

function splitLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    // La puntuación final no es parte del enlace.
    const raw = m[0].replace(/[.,;:!?)\]]+$/, "");
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    out.push({ type: "link", href: raw, text: raw });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

// Parte el mensaje en texto, chapitas de referencia y enlaces.
export function splitMessage(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(...splitLinks(body.slice(last, start)));
    out.push({ type: "ref", kind: m[1] as RefKind, id: m[2] });
    last = start + m[0].length;
  }
  if (last < body.length) out.push(...splitLinks(body.slice(last)));
  return out;
}

// El compositor muestra "#SAI-12 título" y recuerda a qué marca corresponde;
// al enviar se cambia cada texto insertado por su marca.
export function applyInsertedRefs(text: string, inserted: Array<{ text: string; token: string }>): string {
  let out = text;
  for (const r of inserted) {
    const i = out.indexOf(r.text);
    if (i >= 0) out = out.slice(0, i) + r.token + out.slice(i + r.text.length);
  }
  return out;
}

// Texto plano del mensaje (para avisos push): las marcas pasan a su etiqueta.
export function plainText(body: string, labelOf: (ref: ParsedRef) => string): string {
  return body.replace(TOKEN_RE, (_m, kind: RefKind, id: string) => labelOf({ kind, id }));
}

// Reacciones rápidas (las que se ofrecen al tocar el botón de reaccionar).
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"];

// Texto corto de un mensaje para citarlo en una respuesta.
export function snippetOf(body: string, hasFiles: boolean, max = 110): string {
  const t = body.replace(TOKEN_RE, (_m, kind: string) => `[${kind === "project" ? "proyecto" : kind === "issue" ? "ticket" : kind === "sprint" ? "sprint" : kind === "card" ? "biblioteca" : "persona"}]`).replace(/\s+/g, " ").trim();
  if (!t) return hasFiles ? "Archivo adjunto" : "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export const CHAT_COLORS = ["#6d28d9", "#0a7a5a", "#2563eb", "#db2777", "#b45309", "#dc2626", "#0891b2", "#4f46e5", "#65a30d", "#475569"];

export function isValidChatColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export const CHAT_EMOJIS = [
  "😀", "😄", "😁", "😂", "🤣", "😊", "😉", "😍", "🥰", "😎", "🤔", "😅", "😭", "😢", "😡", "🙄",
  "😴", "🤯", "🥳", "😬", "🙃", "😇", "🤗", "🫡", "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "🤝",
  "👋", "✌️", "🤞", "👌", "❤️", "💜", "💚", "🔥", "✨", "⭐", "🎉", "🚀", "💡", "✅", "❌", "⚠️",
  "❓", "❗", "📌", "📎", "📅", "⏰", "🐛", "🛠️", "💻", "📱", "🔒", "🔑", "📊", "📈", "📝", "📄",
  "☕", "🍕", "🎯", "🏁", "🧠", "🤖", "👨‍💻", "👩‍💻",
];

// Menciones escritas a mano con el código del proyecto o del ticket: "#SAI" o "#SAI-12".
// Devuelve dónde están (ignorando lo que ya es una mención [[...]]) para que el servidor las convierta.
export type KeyMention = { start: number; end: number; key: string; number: number | null };

export function findKeyMentions(body: string): KeyMention[] {
  const out: KeyMention[] = [];
  const skip: Array<[number, number]> = [];
  for (const m of body.matchAll(/\[\[[^\]]*\]\]/g)) skip.push([m.index!, m.index! + m[0].length]);
  for (const m of body.matchAll(/(^|\s)#([A-Za-z][A-Za-z0-9]{1,4})(?:-(\d{1,6}))?(?![A-Za-z0-9-])/g)) {
    const start = m.index! + m[1].length;
    if (skip.some(([a, b]) => start >= a && start < b)) continue;
    out.push({ start, end: m.index! + m[0].length, key: m[2].toUpperCase(), number: m[3] ? Number(m[3]) : null });
  }
  return out;
}

// Texto de "quién reaccionó" al estilo Discord: "Tú, Ana y 2 más reaccionaron".
// Si `myName` es el nombre de quien mira y está entre los que reaccionaron, aparece primero como "Tú".
export function reactorsText(users: string[], myName: string | null, max = 3): string {
  const mine = myName ? users.indexOf(myName) : -1;
  const others = users.filter((_, i) => i !== mine);
  const names = [...(mine >= 0 ? ["Tú"] : []), ...others];
  if (names.length === 0) return "";
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")} y ${rest} más` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}` : shown[0];
  const verb = names.length > 1 ? "reaccionaron" : shown[0] === "Tú" ? "reaccionaste" : "reaccionó";
  return `${list} ${verb}`;
}
