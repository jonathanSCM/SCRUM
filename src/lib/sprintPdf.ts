import PDFDocument from "pdfkit";
import type { SprintInsights } from "@/lib/gemini";
import { basicSuggestions, pdfSafe, sortTickets, summarizeTickets, type SprintReportData } from "@/lib/scrum/sprintReport";

// Informe PDF del sprint: resumen, carga por persona, sugerencias, riesgos,
// orden recomendado y el detalle de cada ticket.

const INK = "#1f1b2e";
const SOFT = "#4b4560";
const FAINT = "#8a84a0";
const ACCENT = "#6d28d9";
const LINE = "#d9d4e6";
const WARN = "#b45309";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export function renderSprintPdf(data: SprintReportData, insights: SprintInsights | null): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: { Title: `${data.project.name} · ${data.sprint.name}`, Author: "SCRUM ProShop" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;
  const ensure = (height: number) => {
    if (doc.y + height > bottomLimit()) doc.addPage();
  };
  const text = (value: string, font: "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique", size: number, color: string, opts: PDFKit.Mixins.TextOptions = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(pdfSafe(value), left, doc.y, { width, ...opts });
  };
  const heading = (value: string) => {
    ensure(50);
    doc.moveDown(0.9);
    text(value, "Helvetica-Bold", 13, ACCENT);
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(LINE).lineWidth(1).stroke();
    doc.moveDown(0.5);
  };
  const bullets = (items: string[]) => {
    for (const item of items) {
      const h = doc.font("Helvetica").fontSize(10).heightOfString(pdfSafe(item), { width: width - 14 });
      ensure(h + 6);
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(ACCENT).text("•", left, y, { width: 10 });
      doc.fillColor(INK).text(pdfSafe(item), left + 14, y, { width: width - 14 });
      doc.moveDown(0.25);
    }
  };

  const tickets = sortTickets(data.tickets);
  const summary = summarizeTickets(tickets);
  const tips = new Map((insights?.ticketTips ?? []).map((t) => [t.key, t.tip]));

  // ---- Portada / resumen ----
  text(data.project.name, "Helvetica", 11, FAINT);
  text(`Inicio del sprint · ${data.sprint.name}`, "Helvetica-Bold", 22, INK);
  doc.moveDown(0.2);
  text(`${fmt(data.sprint.startDate)} – ${fmt(data.sprint.endDate)}`, "Helvetica", 11, SOFT);
  if (data.sprint.goal) {
    doc.moveDown(0.6);
    text("Objetivo", "Helvetica-Bold", 10, FAINT);
    text(data.sprint.goal, "Helvetica", 11, INK);
  }

  doc.moveDown(0.8);
  const stats: Array<[string, string]> = [
    ["Tickets", String(summary.count)],
    ["Puntos", String(summary.points)],
    ["Sin estimar", String(summary.unestimated)],
    ["Sin responsable", String(summary.unassigned)],
    ["Falta información", String(summary.notReady)],
  ];
  const boxW = width / stats.length;
  const boxY = doc.y;
  stats.forEach(([label, value], i) => {
    const x = left + i * boxW;
    doc.rect(x + 2, boxY, boxW - 4, 46).strokeColor(LINE).lineWidth(1).stroke();
    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(value, x + 2, boxY + 7, { width: boxW - 4, align: "center" });
    doc.font("Helvetica").fontSize(8).fillColor(FAINT).text(label, x + 2, boxY + 31, { width: boxW - 4, align: "center" });
  });
  doc.y = boxY + 58;

  if (insights?.summary) {
    heading("Resumen");
    text(insights.summary, "Helvetica", 10.5, INK, { lineGap: 2 });
  }

  // ---- Carga por persona ----
  heading("Carga por persona");
  for (const row of summary.byAssignee) {
    ensure(18);
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(pdfSafe(row.name), left, y, { width: width * 0.55 });
    doc.fillColor(SOFT).text(`${row.count} ${row.count === 1 ? "ticket" : "tickets"} · ${row.points} pts`, left + width * 0.55, y, { width: width * 0.45, align: "right" });
    const share = summary.points > 0 ? row.points / summary.points : 0;
    doc.rect(left, y + 14, width, 3).fillColor("#ece8f5").fill();
    doc.rect(left, y + 14, Math.max(2, width * share), 3).fillColor(ACCENT).fill();
    doc.y = y + 24;
  }

  // ---- Sugerencias ----
  const suggestions = [...(insights?.suggestions ?? []), ...basicSuggestions(tickets)];
  if (suggestions.length) {
    heading(insights ? "Sugerencias" : "Sugerencias (automáticas)");
    bullets(suggestions);
  }
  if (insights?.risks.length) {
    heading("Riesgos a vigilar");
    bullets(insights.risks);
  }
  if (insights?.suggestedOrder.length) {
    heading("Orden de ejecución recomendado");
    const byKey = new Map(tickets.map((t) => [t.key, t]));
    bullets(insights.suggestedOrder.map((k, i) => `${i + 1}. ${k} — ${byKey.get(k)?.title ?? ""}`));
  }

  // ---- Detalle de tickets ----
  doc.addPage();
  text(`Detalle de tickets (${tickets.length})`, "Helvetica-Bold", 16, INK);
  doc.moveDown(0.3);
  text("Ordenados por prioridad.", "Helvetica", 9, FAINT);
  doc.moveDown(0.6);

  for (const t of tickets) {
    const desc = t.description.trim().slice(0, 500);
    const tip = tips.get(t.key);
    const meta = [t.type, `Prioridad ${t.priority}`, t.points != null ? `${t.points} pts` : "sin estimar", t.assignee ?? "sin responsable", t.epic ? `Épica: ${t.epic}` : null, t.dueDate ? `Vence ${fmt(t.dueDate)}` : null]
      .filter(Boolean)
      .join("  ·  ");
    const innerW = width - 16;
    const estimate =
      22 +
      doc.font("Helvetica-Bold").fontSize(11).heightOfString(pdfSafe(t.title), { width: innerW }) +
      doc.font("Helvetica").fontSize(8.5).heightOfString(pdfSafe(meta), { width: innerW }) +
      (desc ? doc.font("Helvetica").fontSize(9).heightOfString(pdfSafe(desc), { width: innerW }) + 4 : 0) +
      (t.readyMissing.length ? 16 : 0) +
      (tip ? doc.font("Helvetica-Oblique").fontSize(9).heightOfString(pdfSafe(`Sugerencia: ${tip}`), { width: innerW }) + 6 : 0);
    ensure(estimate + 8);

    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text(pdfSafe(t.key), left + 8, top + 6, { width: innerW });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(pdfSafe(t.title), left + 8, doc.y + 1, { width: innerW });
    doc.font("Helvetica").fontSize(8.5).fillColor(SOFT).text(pdfSafe(meta), left + 8, doc.y + 2, { width: innerW });
    if (desc) doc.font("Helvetica").fontSize(9).fillColor(INK).text(pdfSafe(desc), left + 8, doc.y + 4, { width: innerW });
    if (t.readyMissing.length) doc.font("Helvetica-Bold").fontSize(8.5).fillColor(WARN).text(pdfSafe(`Falta: ${t.readyMissing.join(", ")}`), left + 8, doc.y + 4, { width: innerW });
    if (tip) doc.font("Helvetica-Oblique").fontSize(9).fillColor(ACCENT).text(pdfSafe(`Sugerencia: ${tip}`), left + 8, doc.y + 4, { width: innerW });
    const bottom = doc.y + 6;
    doc.rect(left, top, width, bottom - top).strokeColor(LINE).lineWidth(0.8).stroke();
    doc.y = bottom + 8;
  }

  // ---- Pie con número de página ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // si no, escribir al pie crea una página nueva
    doc.font("Helvetica").fontSize(8).fillColor(FAINT).text(pdfSafe(`${data.project.name} · ${data.sprint.name}  —  Página ${i + 1} de ${range.count}`), left, doc.page.height - 30, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = saved;
  }

  doc.end();
  return done;
}
