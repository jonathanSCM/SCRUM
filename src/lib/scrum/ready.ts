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

// La definición de cada ticket parte de la del proyecto, y se puede personalizar:
//  - readyOff: ítems del proyecto que a este ticket no le aplican;
//  - readyExtra: ítems propios de este ticket.
export function effectiveReadyItems(template: string[], extra: string[] = [], off: string[] = []): string[] {
  const skip = new Set(off);
  return [...new Set([...template.filter((i) => !skip.has(i)), ...extra])];
}

// Ítems de la definición que el ticket todavía no cubre.
export function missingReadyItems(items: string[], done: string[]): string[] {
  const set = new Set(done);
  return items.filter((item) => !set.has(item));
}

export type ReadyCheckTask = { key: string; title: string; readyDone: string[]; readyExtra?: string[]; readyOff?: string[] };

// Tickets de un sprint que no cumplen su definición (para avisar al iniciarlo).
export function ticketsNotReady(template: string[], tasks: ReadyCheckTask[]) {
  return tasks
    .map((t) => ({ key: t.key, title: t.title, missing: missingReadyItems(effectiveReadyItems(template, t.readyExtra, t.readyOff), t.readyDone) }))
    .filter((t) => t.missing.length > 0);
}
