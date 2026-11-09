// Avisos al teléfono con ntfy: tema, prioridad y mensaje (código puro).

export type NtfyPriority = "low" | "default" | "high" | "urgent";

// Prioridades de ntfy: 1 mínima, 3 normal, 4 alta, 5 urgente (suena aunque esté en "no molestar", según la app).
export const NTFY_PRIORITY: Record<NtfyPriority, number> = { low: 2, default: 3, high: 4, urgent: 5 };

// Tema secreto: el nombre del tema es la "contraseña" de lectura, así que debe ser largo y aleatorio.
export function topicFrom(randomHex: string): string {
  return `scrum-${randomHex}`;
}
export const TOPIC_PATTERN = /^scrum-[0-9a-f]{32}$/;

export type NtfyInput = { title: string; body: string; url?: string; priority?: NtfyPriority };

// Cuerpo JSON para publicar en ntfy (la API JSON admite UTF-8: tildes y comillas).
export function toNtfyMessage(topic: string, input: NtfyInput, opts: { minimal: boolean; baseUrl: string }) {
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const click = input.url ? (/^https?:\/\//.test(input.url) ? input.url : `${opts.baseUrl}${input.url.startsWith("/") ? "" : "/"}${input.url}`) : undefined;
  return {
    topic,
    title: clip(input.title, 120),
    message: opts.minimal ? "Toca para abrir en SCRUM ProShop" : clip(input.body || input.title, 500),
    priority: NTFY_PRIORITY[input.priority ?? "default"],
    ...(click ? { click } : {}),
  };
}

// Los códigos que significan "este tema o permiso ya no sirve": se cuentan como fallo del canal.
export function isPermanentFailure(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export const MAX_FAILURES = 3;
