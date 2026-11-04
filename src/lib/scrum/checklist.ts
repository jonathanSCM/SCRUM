// Checklist dentro de la tarjeta y jerarquía historia > tarea (código puro).

export type ChecklistItem = { id: string; text: string; done: boolean };

export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i): i is ChecklistItem => !!i && typeof i.id === "string" && typeof i.text === "string" && typeof i.done === "boolean")
      .map((i) => ({ id: i.id, text: i.text, done: i.done }));
  } catch {
    return [];
  }
}

export function checklistProgress(items: ChecklistItem[]) {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// Solo las tareas y los bugs cuelgan de una historia (la historia cuelga de una épica).
export function canHaveParent(issueType: string): boolean {
  return issueType === "TASK" || issueType === "BUG";
}

// Progreso de una historia a partir de sus tareas.
export function storyProgress(children: Array<{ status: string }>) {
  const done = children.filter((c) => c.status === "DONE").length;
  return { done, total: children.length, pct: children.length ? Math.round((done / children.length) * 100) : 0 };
}
