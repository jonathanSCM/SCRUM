// Definition of Ready: lista de cosas que tienen que estar disponibles antes de
// empezar un ticket (estructura de datos del cliente, accesos, brief…). La lista
// se define por proyecto (Project.readyItems) y cada ticket guarda cuáles ya
// están cubiertas (Task.readyDone). Ambos son JSON de textos.

export function parseStringList(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  } catch {
    return [];
  }
}

// Ítems de la definición que el ticket todavía no cubre.
export function missingReadyItems(template: string[], done: string[]): string[] {
  const set = new Set(done);
  return template.filter((item) => !set.has(item));
}

export type ReadyCheckTask = { key: string; title: string; readyDone: string[] };

// Tickets de un sprint que no cumplen la definición (para avisar al iniciarlo).
export function ticketsNotReady(template: string[], tasks: ReadyCheckTask[]) {
  if (template.length === 0) return [];
  return tasks
    .map((t) => ({ key: t.key, title: t.title, missing: missingReadyItems(template, t.readyDone) }))
    .filter((t) => t.missing.length > 0);
}
