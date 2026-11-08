// Biblioteca del equipo: tarjetas con varios archivos y enlaces (código puro).

export const CARD_CATEGORIES = [
  { value: "RESOLUCION_REUNION", label: "Resolución de reunión" },
  { value: "ACTA", label: "Acta" },
  { value: "CONTRATO", label: "Contrato" },
  { value: "ENTREGABLE", label: "Entregable" },
  { value: "REFERENCIA", label: "Referencia" },
  { value: "OTRO", label: "Otro" },
] as const;

export type CardCategory = (typeof CARD_CATEGORIES)[number]["value"];
export const CATEGORY_VALUES = CARD_CATEGORIES.map((c) => c.value) as [CardCategory, ...CardCategory[]];

export function categoryLabel(value: string): string {
  return CARD_CATEGORIES.find((c) => c.value === value)?.label ?? "Otro";
}

export function normalizeCategory(value: unknown): CardCategory {
  return CARD_CATEGORIES.some((c) => c.value === value) ? (value as CardCategory) : "OTRO";
}

export const MAX_CARD_ITEMS = 30;
export const MAX_CARD_BYTES = 40 * 1024 * 1024; // total de archivos por tarjeta (se guardan en la base)

// ¿Cabe esta tanda de archivos en la tarjeta? Devuelve el motivo si no.
export function checkCardCapacity(current: { items: number; bytes: number }, adding: Array<{ size: number }>): string | null {
  if (current.items + adding.length > MAX_CARD_ITEMS) return `Una tarjeta admite hasta ${MAX_CARD_ITEMS} archivos y enlaces`;
  const total = current.bytes + adding.reduce((n, f) => n + f.size, 0);
  if (total > MAX_CARD_BYTES) return `La tarjeta superaría los ${MAX_CARD_BYTES / (1024 * 1024)} MB en total: súbelos a Drive y agrega el enlace`;
  return null;
}
