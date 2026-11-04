// Utilidades de las notas del proyecto (código puro, con tests).

export const NOTE_KIND_META = {
  BRIEF: { label: "Brief" },
  REUNION: { label: "Reunión" },
  PLANNING: { label: "Planning" },
  REVIEW: { label: "Review" },
  GENERAL: { label: "General" },
} as const;

export type NoteKind = keyof typeof NOTE_KIND_META;

export function isNoteKind(value: string): value is NoteKind {
  return value in NOTE_KIND_META;
}

// Saca de una nota los puntos que parecen tareas: viñetas ("- ", "* ", "• "),
// casillas ("- [ ] ") y numeraciones ("1. ", "1) "). Las casillas ya marcadas
// ("- [x]") se ignoran. Sin duplicados y con un máximo.
export function extractActionItems(body: string, max = 30): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/);
    if (!m) continue;
    let text = m[1];
    const box = text.match(/^\[( |x|X)\]\s*(.*)$/);
    if (box) {
      if (box[1] !== " ") continue;
      text = box[2];
    }
    text = text.trim().slice(0, 300);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    items.push(text);
    if (items.length >= max) break;
  }
  return items;
}
