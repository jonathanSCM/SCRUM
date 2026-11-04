// Claves tipo Jira: el proyecto tiene una clave corta ("PRO") y cada ticket un
// número secuencial por proyecto ("PRO-12").

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/;

export function isValidProjectKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function normalizeProjectKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function letters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

const STOP_WORDS = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "PARA", "EN", "CON", "A", "AL", "THE", "OF", "AND"]);

// Sugiere una clave a partir del nombre ("Sistema de Facturación" -> "SIF",
// "ProShop CRM" -> "PRC") y la desambigua contra las ya usadas agregando un
// número ("SIF", "SIF2", ...).
export function suggestProjectKey(name: string, taken: Iterable<string> = []): string {
  const used = new Set(Array.from(taken, (k) => k.toUpperCase()));
  const all = name
    .split(/\s+/)
    .map(letters)
    .filter((w) => w.length > 0);
  const significant = all.filter((w) => !STOP_WORDS.has(w));
  const words = significant.length > 0 ? significant : all;

  let base = "";
  if (words.length >= 3) base = words.map((w) => w[0]).join("").slice(0, 4);
  else if (words.length === 2) base = (words[0].slice(0, 2) + words[1][0]).slice(0, 3);
  else if (words.length === 1) base = words[0].slice(0, 3);
  if (base.length < 2) base = (base + "XX").slice(0, 3);

  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 5 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}

export function formatIssueKey(projectKey: string | null | undefined, number: number | null | undefined): string {
  if (!projectKey || number == null) return "—";
  return `${projectKey}-${number}`;
}

export function parseIssueKey(input: string): { projectKey: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]{1,4})-(\d{1,9})$/.exec(input.trim());
  if (!match) return null;
  return { projectKey: match[1].toUpperCase(), number: Number(match[2]) };
}
