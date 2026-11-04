import { z } from "zod";
import { sortTickets, summarizeTickets, type SprintReportData } from "@/lib/scrum/sprintReport";

// Sugerencias para el sprint con Gemini (API REST, sin SDK). La clave se lee
// de GEMINI_API_KEY (variable de entorno). NUNCA lanza: si Gemini falla, el
// informe sale igual, solo sin la parte de IA.

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 40000;

export const insightsSchema = z.object({
  summary: z.string().default(""),
  suggestions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  suggestedOrder: z.array(z.string()).default([]),
  ticketTips: z.array(z.object({ key: z.string(), tip: z.string() })).default([]),
});
export type SprintInsights = z.infer<typeof insightsSchema>;

export function buildPrompt(data: SprintReportData): string {
  const s = summarizeTickets(data.tickets);
  const tickets = sortTickets(data.tickets).map((t) => ({
    key: t.key,
    tipo: t.type,
    titulo: t.title,
    descripcion: t.description.slice(0, 600),
    prioridad: t.priority,
    puntos: t.points,
    responsable: t.assignee,
    epica: t.epic,
    fecha_limite: t.dueDate,
    falta_informacion: t.readyMissing,
  }));
  return [
    "Sos un coach Scrum que ayuda a un equipo de desarrollo pequeño. Te paso el sprint que arranca hoy.",
    "Respondé SOLO con un JSON válido (sin markdown) con esta forma exacta:",
    '{"summary": string (2-3 frases sobre el foco y la carga del sprint), "suggestions": string[] (4-6 sugerencias accionables para ejecutarlo bien), "risks": string[] (riesgos concretos, máx. 5), "suggestedOrder": string[] (claves de los tickets en el orden recomendado de ejecución), "ticketTips": [{"key": string, "tip": string}] (una sugerencia breve y concreta, de máx. 25 palabras, para los tickets que más lo necesiten)}',
    "Escribí en español, claro y directo. No inventes tickets: usá solo las claves dadas.",
    "",
    `Proyecto: ${data.project.name}. ${data.project.description.slice(0, 400)}`,
    `Sprint: ${data.sprint.name}. Objetivo: ${data.sprint.goal || "(sin objetivo)"}. Del ${data.sprint.startDate ?? "?"} al ${data.sprint.endDate ?? "?"}.`,
    `Totales: ${s.count} tickets, ${s.points} puntos, ${s.unestimated} sin estimar, ${s.unassigned} sin responsable, ${s.notReady} con información faltante.`,
    "Tickets (JSON):",
    JSON.stringify(tickets),
  ].join("\n");
}

// Acepta el texto de Gemini aunque venga envuelto en ```json … ```.
export function parseInsights(text: string, validKeys: Set<string>): SprintInsights | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = insightsSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) return null;
    const v = parsed.data;
    return {
      summary: v.summary.trim(),
      suggestions: v.suggestions.map((x) => x.trim()).filter(Boolean).slice(0, 8),
      risks: v.risks.map((x) => x.trim()).filter(Boolean).slice(0, 6),
      suggestedOrder: v.suggestedOrder.filter((k) => validKeys.has(k)),
      ticketTips: v.ticketTips.filter((t) => validKeys.has(t.key) && t.tip.trim()).map((t) => ({ key: t.key, tip: t.tip.trim() })),
    };
  } catch {
    return null;
  }
}

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function generateSprintInsights(data: SprintReportData): Promise<SprintInsights | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || data.tickets.length === 0) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(data) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[gemini] respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      return null;
    }
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const insights = parseInsights(text, new Set(data.tickets.map((t) => t.key)));
    if (!insights) console.error("[gemini] la respuesta no tenía el formato esperado");
    return insights;
  } catch (err) {
    console.error("[gemini] error:", err instanceof Error ? err.name : "desconocido");
    return null;
  }
}
