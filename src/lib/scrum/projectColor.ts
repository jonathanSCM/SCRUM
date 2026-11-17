// Color opcional de un proyecto (código puro, con tests). Sin color es lo normal; con color se ve en las tarjetas,
// la tabla, el encabezado del proyecto y en Mi trabajo.

export const PROJECT_COLORS = [
  { value: "#7c3aed", label: "Violeta" },
  { value: "#2563eb", label: "Azul" },
  { value: "#0891b2", label: "Turquesa" },
  { value: "#059669", label: "Verde" },
  { value: "#65a30d", label: "Lima" },
  { value: "#ca8a04", label: "Mostaza" },
  { value: "#ea580c", label: "Naranja" },
  { value: "#dc2626", label: "Rojo" },
  { value: "#db2777", label: "Rosa" },
  { value: "#475569", label: "Gris azulado" },
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isProjectColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

// Lo que viene de la base o de la API: un #RRGGBB válido o null.
export function normalizeProjectColor(v: unknown): string | null {
  return isProjectColor(v) ? v.toLowerCase() : null;
}
