import { describe, expect, it } from "vitest";
import { suggestProjectKey, normalizeProjectKey, isValidProjectKey, formatIssueKey, parseIssueKey } from "./issueKey";
import { rankBetween, needsRebalance, rebalance, compareByRank, RANK_STEP } from "./rank";
import { computeBurndown } from "./burndown";
import { computeVelocity } from "./velocity";
import { validateStart, snapshotOnStart, planCompletion, durationToEnd, daysRemaining, validateLeaveActiveSprint } from "./sprintLifecycle";
import { parseStringList, missingReadyItems, ticketsNotReady } from "./ready";
import { formatTelegramText, TELEGRAM_TOKEN_PATTERN, TELEGRAM_CHAT_PATTERN } from "../telegram";
import { formatSlackText, SLACK_WEBHOOK_PATTERN } from "../slack";
import { extractActionItems } from "./notes";
import { parseInsights, buildPrompt } from "../gemini";
import { renderSprintPdf } from "../sprintPdf";
import { basicSuggestions, pdfSafe, sortTickets, summarizeTickets, type ReportTicket, type SprintReportData } from "./sprintReport";
import { isValidDateString, shiftDate, missingStandups, summarizeReview, localDateString } from "./ceremonies";
import { parseChecklist, checklistProgress, canHaveParent, storyProgress } from "./checklist";
import { legacyTypeToStatus, isLegacyType, matchUserByName, sprintStateFromDates } from "./legacyMap";

describe("issueKey", () => {
  it("sugiere claves a partir del nombre", () => {
    expect(suggestProjectKey("Sistema de Facturación")).toBe("SIF");
    expect(suggestProjectKey("ProShop CRM")).toBe("PRC");
    expect(suggestProjectKey("Directo")).toBe("DIR");
    expect(suggestProjectKey("Mi App Web Cliente")).toBe("MAWC");
    expect(suggestProjectKey("1")).toBe("XX");
  });

  it("desambigua contra claves usadas", () => {
    expect(suggestProjectKey("Directo", ["DIR"])).toBe("DIR2");
    expect(suggestProjectKey("Directo", ["DIR", "DIR2"])).toBe("DIR3");
    expect(suggestProjectKey("Mi App Web Cliente", ["MAWC"])).toBe("MAWC2");
  });

  it("normaliza y valida claves", () => {
    expect(normalizeProjectKey("pró-shop 2")).toBe("PROSH");
    expect(isValidProjectKey("PRO")).toBe(true);
    expect(isValidProjectKey("P")).toBe(false);
    expect(isValidProjectKey("1AB")).toBe(false);
    expect(isValidProjectKey("ABCDEF")).toBe(false);
  });

  it("formatea y parsea claves de ticket", () => {
    expect(formatIssueKey("PRO", 12)).toBe("PRO-12");
    expect(formatIssueKey(null, 12)).toBe("—");
    expect(parseIssueKey("pro-12")).toEqual({ projectKey: "PRO", number: 12 });
    expect(parseIssueKey("nada")).toBeNull();
  });
});

describe("rank", () => {
  it("calcula el rank entre vecinos", () => {
    expect(rankBetween(null, null)).toBe(RANK_STEP);
    expect(rankBetween(null, 1000)).toBe(1000 - RANK_STEP);
    expect(rankBetween(1000, null)).toBe(1000 + RANK_STEP);
    expect(rankBetween(1000, 2000)).toBe(1500);
  });

  it("detecta cuándo rebalancear y rebalancea", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
    expect(needsRebalance(1, 2)).toBe(false);
    expect(needsRebalance(null, 2)).toBe(false);
    expect(rebalance(["a", "b", "c"])).toEqual([
      { id: "a", rank: RANK_STEP },
      { id: "b", rank: RANK_STEP * 2 },
      { id: "c", rank: RANK_STEP * 3 },
    ]);
  });

  it("ordena por rank y desempata por fecha", () => {
    const list = [
      { id: "b", rank: 2, createdAt: "2026-01-02" },
      { id: "c", rank: 1, createdAt: "2026-01-03" },
      { id: "a", rank: 1, createdAt: "2026-01-01" },
    ];
    expect([...list].sort(compareByRank).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});

describe("burndown", () => {
  const start = new Date("2026-03-02T09:00:00Z"); // lunes
  const end = new Date("2026-03-06T23:00:00Z"); // viernes (5 días)

  it("cuenta puntos restantes por día y marca el alcance agregado", () => {
    const result = computeBurndown({
      startedAt: start,
      endDate: end,
      now: new Date("2026-03-04T12:00:00Z"),
      tasks: [
        { storyPoints: 5, sprintAddedAt: start, completedAt: "2026-03-03T10:00:00Z", status: "DONE" },
        { storyPoints: 3, sprintAddedAt: null, completedAt: null, status: "TODO" },
        { storyPoints: 2, sprintAddedAt: "2026-03-03T08:00:00Z", completedAt: null, status: "IN_PROGRESS" },
      ],
    });
    expect(result.unit).toBe("points");
    expect(result.committed).toBe(8);
    expect(result.scopeAdded).toBe(2);
    expect(result.completed).toBe(5);
    expect(result.points).toHaveLength(6); // inicio + 5 días
    expect(result.points[0]).toMatchObject({ label: "inicio", ideal: 8, remaining: 8 });
    // fin del lunes: nada hecho, el ticket agregado todavía no existía
    expect(result.points[1].remaining).toBe(8);
    // fin del martes: se hizo el de 5 y se agregó el de 2
    expect(result.points[2].remaining).toBe(3 + 2);
    // hoy es miércoles: se muestra hasta ahora
    expect(result.points[3].remaining).toBe(5);
    // jueves y viernes todavía no llegaron
    expect(result.points[4].remaining).toBeNull();
    expect(result.points[5]).toMatchObject({ ideal: 0, remaining: null });
  });

  it("usa cantidad de tickets si nadie estimó", () => {
    const result = computeBurndown({
      startedAt: start,
      endDate: end,
      now: new Date("2026-03-10T00:00:00Z"),
      tasks: [
        { storyPoints: null, sprintAddedAt: null, completedAt: "2026-03-05T10:00:00Z", status: "DONE" },
        { storyPoints: null, sprintAddedAt: null, completedAt: null, status: "TODO" },
      ],
    });
    expect(result.unit).toBe("count");
    expect(result.committed).toBe(2);
    expect(result.points[result.points.length - 1].remaining).toBe(1);
  });

  it("no pasa del cierre si el sprint ya se completó", () => {
    const result = computeBurndown({
      startedAt: start,
      endDate: end,
      completedAt: "2026-03-04T18:00:00Z",
      now: new Date("2026-04-01T00:00:00Z"),
      tasks: [{ storyPoints: 4, sprintAddedAt: null, completedAt: "2026-03-04T10:00:00Z", status: "DONE" }],
    });
    expect(result.points[3].remaining).toBe(0);
    expect(result.points[4].remaining).toBeNull();
  });
});

describe("velocity", () => {
  const sprint = (i: number, committed: number, completed: number, state = "COMPLETED") => ({
    id: `s${i}`,
    name: `Sprint ${i}`,
    state,
    completedAt: new Date(2026, 0, i + 1),
    startDate: new Date(2026, 0, i),
    committedPoints: committed,
    completedPoints: completed,
    committedCount: 5,
    completedCount: 3,
  });

  it("toma solo sprints cerrados, ordenados, y promedia lo completado", () => {
    const result = computeVelocity([sprint(3, 10, 8), sprint(1, 10, 4), sprint(2, 12, 12), sprint(4, 5, 0, "ACTIVE")]);
    expect(result.unit).toBe("points");
    expect(result.bars.map((b) => b.name)).toEqual(["Sprint 1", "Sprint 2", "Sprint 3"]);
    expect(result.average).toBe(8);
  });

  it("limita a los últimos N y cae a cantidad sin puntos", () => {
    const many = Array.from({ length: 9 }, (_, i) => sprint(i + 1, 0, 0));
    const result = computeVelocity(many, 7);
    expect(result.unit).toBe("count");
    expect(result.bars).toHaveLength(7);
    expect(result.bars[0].name).toBe("Sprint 3");
    expect(result.average).toBe(3);
  });
});

describe("sprintLifecycle", () => {
  const d = (s: string) => new Date(s);

  it("valida el inicio del sprint", () => {
    const ok = { name: "S1", startDate: d("2026-03-02"), endDate: d("2026-03-16"), state: "PLANNED", hasOtherActiveSprint: false };
    expect(validateStart(ok)).toBeNull();
    expect(validateStart({ ...ok, state: "ACTIVE" })).toMatch(/planificado/);
    expect(validateStart({ ...ok, hasOtherActiveSprint: true })).toMatch(/sprint activo/);
    expect(validateStart({ ...ok, name: "  " })).toMatch(/nombre/);
    expect(validateStart({ ...ok, endDate: null })).toMatch(/fecha/);
    expect(validateStart({ ...ok, endDate: d("2026-03-01") })).toMatch(/posterior/);
  });

  it("arma la foto de inicio y el plan de cierre", () => {
    const tasks = [
      { id: "a", status: "DONE", storyPoints: 5 },
      { id: "b", status: "IN_REVIEW", storyPoints: 3 },
      { id: "c", status: "TODO", storyPoints: null },
    ];
    expect(snapshotOnStart(tasks)).toEqual({ committedPoints: 8, committedCount: 3 });
    expect(planCompletion(tasks, "next")).toEqual({
      completedPoints: 5,
      completedCount: 1,
      unfinishedIds: ["b", "c"],
      destinationSprintId: "next",
    });
    expect(planCompletion(tasks, null).destinationSprintId).toBeNull();
  });

  it("calcula la duración y los días que quedan", () => {
    expect(durationToEnd(d("2026-03-02T00:00:00Z"), 2).toISOString()).toBe("2026-03-16T00:00:00.000Z");
    expect(daysRemaining(d("2026-03-05T00:00:00Z"), d("2026-03-03T12:00:00Z"))).toBe(2);
    expect(daysRemaining(d("2026-03-01T00:00:00Z"), d("2026-03-03T12:00:00Z"))).toBe(0);
    expect(daysRemaining(null)).toBeNull();
  });
});

describe("legacyMap", () => {
  it("convierte el falso estado viejo", () => {
    expect(legacyTypeToStatus("CAMBIO_REALIZADO")).toBe("DONE");
    expect(legacyTypeToStatus("CAMBIO_A_REALIZAR")).toBe("TODO");
    expect(legacyTypeToStatus("CAMBIO_NECESARIO")).toBe("TODO");
    expect(legacyTypeToStatus("CAMBIO_PENDIENTE")).toBe("TODO");
    expect(isLegacyType("CAMBIO_PENDIENTE")).toBe(true);
    expect(isLegacyType("")).toBe(false);
    expect(isLegacyType("TASK")).toBe(false);
  });

  it("reconecta encargados por nombre ignorando tildes y mayúsculas", () => {
    const users = [
      { id: "u1", name: "María Gómez" },
      { id: "u2", name: "Admin" },
    ];
    expect(matchUserByName("maria gomez", users)?.id).toBe("u1");
    expect(matchUserByName("Pedro", users)).toBeNull();
    expect(matchUserByName(null, users)).toBeNull();
  });

  it("deduce el estado de un sprint viejo por sus fechas", () => {
    const now = new Date("2026-03-10T00:00:00Z");
    expect(sprintStateFromDates(new Date("2026-03-01"), new Date("2026-03-05"), now)).toBe("COMPLETED");
    expect(sprintStateFromDates(new Date("2026-03-08"), new Date("2026-03-15"), now)).toBe("ACTIVE");
    expect(sprintStateFromDates(new Date("2026-03-12"), new Date("2026-03-20"), now)).toBe("PLANNED");
    expect(sprintStateFromDates(null, null, now)).toBe("PLANNED");
  });
});

describe("validateLeaveActiveSprint", () => {
  const base = { currentSprintState: "ACTIVE", currentSprintId: "s1", nextSprintId: null as string | null };
  it("bloquea a un miembro que saca un ticket de un sprint activo", () => {
    expect(validateLeaveActiveSprint({ ...base, actorRole: "MEMBER" })).toMatch(/líder/);
  });
  it("permite al líder", () => {
    expect(validateLeaveActiveSprint({ ...base, actorRole: "LEAD" })).toBeNull();
  });
  it("no afecta a sprints planificados ni a cambios que no sacan el ticket", () => {
    expect(validateLeaveActiveSprint({ ...base, currentSprintState: "PLANNED", actorRole: "MEMBER" })).toBeNull();
    expect(validateLeaveActiveSprint({ ...base, nextSprintId: "s1", actorRole: "MEMBER" })).toBeNull();
  });
});

describe("ready (Definition of Ready)", () => {
  const template = ["Estructura de datos", "Accesos"];
  it("parsea listas y tolera basura", () => {
    expect(parseStringList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseStringList("nope")).toEqual([]);
    expect(parseStringList('[1,"x",""]')).toEqual(["x"]);
  });
  it("calcula lo que falta", () => {
    expect(missingReadyItems(template, ["Accesos"])).toEqual(["Estructura de datos"]);
    expect(missingReadyItems(template, ["Accesos", "Estructura de datos", "viejo"])).toEqual([]);
  });
  it("lista los tickets incompletos y no bloquea si no hay definición", () => {
    const tasks = [
      { key: "A-1", title: "uno", readyDone: ["Accesos", "Estructura de datos"] },
      { key: "A-2", title: "dos", readyDone: [] },
    ];
    expect(ticketsNotReady(template, tasks)).toEqual([{ key: "A-2", title: "dos", missing: template }]);
    expect(ticketsNotReady([], tasks)).toEqual([]);
  });
});

describe("notificaciones Telegram / Slack", () => {
  const msg = { title: "Hecho <b>", description: "**Ana** cerró «x» & más", url: "https://x.test/a", mentionUsername: "ana_dev", mentionSlackId: "U01ABCDE2F3" };
  it("Telegram escapa HTML y convierte negritas", () => {
    const text = formatTelegramText(msg);
    expect(text).toContain("<b>Hecho &lt;b&gt;</b>");
    expect(text).toContain("<b>Ana</b> cerró «x» &amp; más");
    expect(text).toContain("@ana_dev");
  });
  it("Slack escapa y menciona por id", () => {
    const text = formatSlackText(msg);
    expect(text).toContain("*Ana*");
    expect(text).toContain("&amp; más");
    expect(text).toContain("<@U01ABCDE2F3>");
  });
  it("valida token, chat y webhook", () => {
    expect(TELEGRAM_TOKEN_PATTERN.test("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(TELEGRAM_TOKEN_PATTERN.test("basura")).toBe(false);
    expect(TELEGRAM_CHAT_PATTERN.test("-1001234567890")).toBe(true);
    expect(TELEGRAM_CHAT_PATTERN.test("@mi_canal")).toBe(true);
    expect(SLACK_WEBHOOK_PATTERN.test("https://hooks.slack.com/services/T000/B000/XXXX")).toBe(true);
    expect(SLACK_WEBHOOK_PATTERN.test("https://evil.test/services/T/B/X")).toBe(false);
  });
});

describe("extractActionItems", () => {
  it("saca viñetas, casillas y numeraciones; ignora lo marcado y los duplicados", () => {
    const body = [
      "Reunión con el cliente",
      "- Pasar la estructura de datos",
      "* [ ] Enviar cotización",
      "- [x] Ya hecho",
      "1. Configurar el bot",
      "2) configurar el bot",
      "texto suelto",
      "• Revisar accesos",
    ].join("\n");
    expect(extractActionItems(body)).toEqual(["Pasar la estructura de datos", "Enviar cotización", "Configurar el bot", "Revisar accesos"]);
  });
  it("respeta el máximo", () => {
    const body = Array.from({ length: 50 }, (_, i) => `- punto ${i}`).join("\n");
    expect(extractActionItems(body, 5)).toHaveLength(5);
  });
});

describe("informe del sprint", () => {
  const t = (key: string, o: Partial<ReportTicket> = {}): ReportTicket => ({
    key, type: "Tarea", title: `Ticket ${key}`, description: "", priority: "Media", priorityWeight: 2, points: 3, status: "Por hacer",
    assignee: "Ana", epic: null, dueDate: null, readyMissing: [], ...o,
  });
  const data: SprintReportData = {
    project: { name: "Proyecto ñandú", key: "PRO", description: "desc" },
    sprint: { id: "s1", name: "Sprint 1", goal: "Salir a producción 🚀", startDate: "2026-11-02T00:00:00.000Z", endDate: "2026-11-15T23:59:59.000Z" },
    tickets: [t("PRO-1", { priorityWeight: 4, priority: "Urgente" }), t("PRO-2", { points: null, assignee: null, readyMissing: ["Accesos"] }), t("PRO-10", { assignee: "Ana", points: 8 })],
  };
  it("ordena por prioridad y clave", () => {
    expect(sortTickets(data.tickets).map((x) => x.key)).toEqual(["PRO-1", "PRO-2", "PRO-10"]);
  });
  it("resume y sugiere sin IA", () => {
    const s = summarizeTickets(data.tickets);
    expect(s).toMatchObject({ count: 3, points: 11, unestimated: 1, unassigned: 1, notReady: 1 });
    expect(basicSuggestions(data.tickets).join(" ")).toMatch(/sin responsable/);
  });
  it("quita emojis para el PDF", () => {
    expect(pdfSafe("Hola 🚀 ñandú «x»")).toBe("Hola  ñandú «x»");
  });
  it("parsea la respuesta de Gemini (con o sin ```json) y descarta claves inventadas", () => {
    const keys = new Set(["PRO-1", "PRO-2"]);
    const raw = '```json\n{"summary":"ok","suggestions":["a"],"risks":[],"suggestedOrder":["PRO-2","XX-9"],"ticketTips":[{"key":"PRO-1","tip":"hacelo"},{"key":"XX-9","tip":"no"}]}\n```';
    const parsed = parseInsights(raw, keys);
    expect(parsed?.suggestedOrder).toEqual(["PRO-2"]);
    expect(parsed?.ticketTips).toEqual([{ key: "PRO-1", tip: "hacelo" }]);
    expect(parseInsights("no es json", keys)).toBeNull();
    expect(buildPrompt(data)).toContain("PRO-1");
  });
  it("genera un PDF válido, con y sin IA", async () => {
    const withAi = await renderSprintPdf(data, { summary: "Resumen", suggestions: ["Una"], risks: ["Riesgo"], suggestedOrder: ["PRO-1"], ticketTips: [{ key: "PRO-1", tip: "tip" }] });
    const without = await renderSprintPdf(data, null);
    expect(withAi.subarray(0, 5).toString()).toBe("%PDF-");
    expect(without.subarray(0, 5).toString()).toBe("%PDF-");
    expect(withAi.length).toBeGreaterThan(2000);
  });
});

describe("ceremonias", () => {
  it("valida y desplaza fechas", () => {
    expect(isValidDateString("2026-11-04")).toBe(true);
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("04/11/2026")).toBe(false);
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(localDateString(new Date(2026, 10, 4))).toBe("2026-11-04");
  });
  it("detecta quién falta en el daily", () => {
    const members = [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }];
    expect(missingStandups(members, ["a"])).toEqual(["Beto"]);
  });
  it("resume la review", () => {
    const r = summarizeReview([
      { key: "P-1", title: "a", status: "DONE", points: 3 },
      { key: "P-2", title: "b", status: "IN_PROGRESS", points: 5 },
      { key: "P-3", title: "c", status: "DONE", points: null },
    ]);
    expect(r).toMatchObject({ committed: 3, completed: 2, committedPoints: 8, completedPoints: 3 });
    expect(r.notDone).toEqual([{ key: "P-2", title: "b", status: "IN_PROGRESS" }]);
  });
});

describe("checklist y jerarquía", () => {
  it("parsea el checklist y calcula el progreso", () => {
    const items = parseChecklist('[{"id":"a","text":"x","done":true},{"id":"b","text":"y","done":false},{"bad":1}]');
    expect(items).toHaveLength(2);
    expect(checklistProgress(items)).toEqual({ done: 1, total: 2 });
    expect(parseChecklist("nope")).toEqual([]);
  });
  it("solo tareas y bugs cuelgan de una historia", () => {
    expect(canHaveParent("TASK")).toBe(true);
    expect(canHaveParent("BUG")).toBe(true);
    expect(canHaveParent("STORY")).toBe(false);
    expect(canHaveParent("EPIC")).toBe(false);
  });
  it("progreso de una historia", () => {
    expect(storyProgress([{ status: "DONE" }, { status: "TODO" }, { status: "DONE" }, { status: "DONE" }])).toEqual({ done: 3, total: 4, pct: 75 });
    expect(storyProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});
