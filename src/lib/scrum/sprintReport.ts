// Datos y resúmenes del informe de inicio de sprint (código puro, con tests).

export type ReportTicket = {
  key: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  priorityWeight: number;
  points: number | null;
  status: string;
  assignee: string | null;
  epic: string | null;
  dueDate: string | null;
  readyMissing: string[];
};

export type SprintReportData = {
  project: { name: string; key: string | null; description: string };
  sprint: { id: string; name: string; goal: string; startDate: string | null; endDate: string | null };
  tickets: ReportTicket[];
};

export function sortTickets(tickets: ReportTicket[]): ReportTicket[] {
  return [...tickets].sort((a, b) => b.priorityWeight - a.priorityWeight || a.key.localeCompare(b.key, "es", { numeric: true }));
}

export function summarizeTickets(tickets: ReportTicket[]) {
  const byAssignee = new Map<string, { name: string; count: number; points: number }>();
  for (const t of tickets) {
    const name = t.assignee ?? "Sin asignar";
    const row = byAssignee.get(name) ?? { name, count: 0, points: 0 };
    row.count += 1;
    row.points += t.points ?? 0;
    byAssignee.set(name, row);
  }
  return {
    count: tickets.length,
    points: tickets.reduce((sum, t) => sum + (t.points ?? 0), 0),
    unestimated: tickets.filter((t) => t.points == null).length,
    notReady: tickets.filter((t) => t.readyMissing.length > 0).length,
    unassigned: tickets.filter((t) => !t.assignee).length,
    byAssignee: [...byAssignee.values()].sort((a, b) => b.points - a.points || b.count - a.count),
  };
}

// Sugerencias que no necesitan IA: sirven aunque Gemini no esté disponible.
export function basicSuggestions(tickets: ReportTicket[]): string[] {
  const s = summarizeTickets(tickets);
  const out: string[] = [];
  if (s.unassigned > 0) out.push(`Hay ${s.unassigned} ticket(s) sin responsable: asignalos antes de arrancar.`);
  if (s.unestimated > 0) out.push(`Hay ${s.unestimated} ticket(s) sin story points: estimarlos mejora la planificación y el burndown.`);
  if (s.notReady > 0) out.push(`${s.notReady} ticket(s) no cumplen la Definition of Ready: conseguí esa información cuanto antes.`);
  const max = s.byAssignee[0];
  if (max && s.byAssignee.length > 1 && s.points > 0 && max.points / s.points > 0.5) {
    out.push(`${max.name} concentra más de la mitad de los puntos (${max.points} de ${s.points}): conviene repartir la carga.`);
  }
  return out;
}

// Quita lo que las fuentes estándar de PDF (WinAnsi) no pueden dibujar, como
// emojis, para que no salgan caracteres rotos.
export function pdfSafe(text: string): string {
  return text.replace(/[^\n\t -~ -ÿ–—‘’“”•…€]/g, "").replace(/[ \t]+\n/g, "\n");
}
