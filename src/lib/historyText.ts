// Etiquetas legibles de cada campo del historial (código puro, sirve en
// servidor y en navegador). Los campos de la v1 siguen mostrándose.
export const HISTORY_LABEL: Record<string, string> = {
  ticket_creado: "Ticket creado",
  ticket_eliminado: "Ticket eliminado",
  titulo_ticket: "Título",
  descripcion_ticket: "Descripción",
  estado_ticket: "Estado",
  tipo_ticket: "Tipo",
  prioridad_ticket: "Prioridad",
  puntos_ticket: "Story points",
  encargado_ticket: "Encargado",
  sprint_ticket: "Sprint",
  epica_ticket: "Épica",
  historia_ticket: "Historia",
  checklist_ticket: "Checklist (ítems)",
  etiquetas_ticket: "Etiquetas",
  fecha_limite_ticket: "Fecha límite",
  comentario: "Comentario",
  adjunto_subido: "Adjunto subido",
  adjunto_eliminado: "Adjunto eliminado",
  sprint_creado: "Sprint creado",
  sprint_iniciado: "Sprint iniciado",
  sprint_iniciado_sin_ready: "Sprint iniciado sin cumplir la Definition of Ready",
  listo_ticket: "Definition of Ready (ítems cubiertos)",
  ready_proyecto: "Definition of Ready del proyecto",
  sprint_completado: "Sprint completado",
  sprint_eliminado: "Sprint eliminado",
  proyecto_creado: "Proyecto creado",
  estado_proyecto: "Estado del proyecto",
  encargado_proyecto: "Encargado del proyecto",
  descripcion_proyecto: "Descripción del proyecto",
  discord_webhook: "Webhook de Discord",
  telegram_config: "Telegram",
  sprint_briefing: "Informe del sprint (PDF)",
  nota_creada: "Nota creada",
  retro_a_ticket: "Acuerdo de retro convertido en ticket",
  nota_eliminada: "Nota eliminada",
  nota_a_tickets: "Tickets creados desde una nota",
  slack_webhook: "Webhook de Slack",
  // v1
  tarea_creada: "Tarea creada",
  tipo_tarea: "Estado de la tarea",
  prioridad_tarea: "Prioridad de la tarea",
  encargado_tarea: "Encargado de la tarea",
  fecha_limite_tarea: "Fecha límite de la tarea",
  modulo_tarea: "Módulo de la tarea",
  documento_subido: "Documento subido",
  documento_borrado: "Documento borrado",
};

export function describeHistory(entry: { field: string; oldValue: string | null; newValue: string | null; taskTitle: string | null }): {
  label: string;
  detail: string;
} {
  const label = HISTORY_LABEL[entry.field] ?? entry.field;
  const subject = entry.taskTitle ? `«${entry.taskTitle}»` : "";
  let detail: string;
  if (entry.oldValue && entry.newValue) detail = `de «${entry.oldValue}» a «${entry.newValue}»`;
  else if (entry.newValue) detail = `«${entry.newValue}»`;
  else if (entry.oldValue) detail = `antes: «${entry.oldValue}»`;
  else detail = "";
  return { label, detail: [subject, detail].filter(Boolean).join(" — ") };
}
