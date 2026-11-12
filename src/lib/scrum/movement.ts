// A quién avisar cuando un ticket se mueve de estado (código puro).

// Responsable, quien lo reportó, los involucrados y, si el ticket cuelga de una historia o épica, sus responsables.
// Quien hace el movimiento nunca se avisa a sí mismo. Sin repetidos.
export function movementRecipients(opts: { assignee?: string | null; reporter?: string | null; involved?: string[]; owners?: Array<string | null | undefined>; lead?: string | null; actor: string }): string[] {
  const all = [opts.assignee, opts.reporter, ...(opts.involved ?? []), ...(opts.owners ?? []), opts.lead];
  return [...new Set(all.filter((u): u is string => !!u && u !== opts.actor))];
}

// Número para la insignia del icono de la app (se recorta a 99; 0 = sin insignia).
export function badgeCount(unread: number): number {
  if (!Number.isFinite(unread) || unread <= 0) return 0;
  return Math.min(99, Math.floor(unread));
}

// Título de la pestaña con los avisos sin leer: "(3) Backlog | Scrum". Quita un prefijo anterior antes de ponerlo.
export function titleWithBadge(title: string, unread: number): string {
  const clean = title.replace(/^\(\d+\+?\)\s*/, "");
  const n = badgeCount(unread);
  // Con el título vacío (Next lo vacía un instante al navegar) no se pone nada: "(3) " con el espacio final el navegador
  // lo recorta a "(3)", no coincide con lo escrito y el aviso se volvía a poner sin fin (la página se colgaba).
  return n > 0 && clean.trim() ? `(${n}${unread > 99 ? "+" : ""}) ${clean}` : clean;
}
