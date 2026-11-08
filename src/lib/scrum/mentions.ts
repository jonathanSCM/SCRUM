// Menciones con @ en comentarios: "@Ana Pérez" o "@ana" (primer nombre). Código puro.

export type Person = { id: string; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Personas mencionadas en el texto. Se prueba primero con el nombre completo y luego con el primer nombre
// (solo si ese primer nombre es único en el equipo, para no avisar a la persona equivocada).
export function findMentioned(body: string, people: Person[]): Person[] {
  const text = norm(body);
  const found = new Map<string, Person>();
  const boundary = (i: number) => i >= text.length || !/[a-z0-9_]/.test(text[i]);
  const firstCount = new Map<string, number>();
  for (const p of people) {
    const f = norm(p.name).split(/\s+/)[0];
    firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  const has = (needle: string) => {
    let from = 0;
    for (;;) {
      const i = text.indexOf(`@${needle}`, from);
      if (i < 0) return false;
      if ((i === 0 || /[^a-z0-9_@]/.test(text[i - 1])) && boundary(i + 1 + needle.length)) return true;
      from = i + 1;
    }
  };
  for (const p of people) {
    const full = norm(p.name).trim();
    const first = full.split(/\s+/)[0];
    if (full && has(full)) found.set(p.id, p);
    else if (first && firstCount.get(first) === 1 && has(first)) found.set(p.id, p);
  }
  return [...found.values()];
}
