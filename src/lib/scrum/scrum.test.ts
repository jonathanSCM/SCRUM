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
import { buildPushPayload } from "../push";
import { canChangeRole, invitationState, inviteExpiry, normalizeEmail, maxOwnedTeams, toLegacyRole, roleBadge, normalizeRole, migratedRole, canRemoveOrDemote, slugify, uniqueSlug } from "./roles";
import { weekWindow, compareLabel, mergeProjectActivity, WEEK_MS } from "./weekly";
import { isAllowedForToken, isDeletableByToken } from "../aiAccess";
import { importSchema, countIssues, matchMember, issueKeyOf } from "./aiImport";
import { snippetOf, parseRefs, splitMessage, applyInsertedRefs, makeToken, isValidChatColor, plainText } from "./chat";
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

describe("push", () => {
  it("arma el payload sin marcado y con límite", () => {
    const p = buildPushPayload({ title: "SAI-2 asignado", description: "**Ana** te asignó «x»" + " y".repeat(200) }, "/projects/p/board");
    expect(p.body.startsWith("Ana te asignó «x»")).toBe(true);
    expect(p.body.length).toBeLessThanOrEqual(160);
    expect(p.url).toBe("/projects/p/board");
    expect(buildPushPayload({ title: "t", description: "d", url: "https://x/y" }, "/z").url).toBe("https://x/y");
  });
});

describe("chat general", () => {
  const pid = "cmw2qzmlb00027dc301ldwwwj";
  it("encuentra las referencias sin repetir", () => {
    const body = `mirá ${makeToken("project", pid)} y ${makeToken("issue", "abcdefgh12")} otra vez ${makeToken("project", pid)}`;
    expect(parseRefs(body)).toEqual([{ kind: "project", id: pid }, { kind: "issue", id: "abcdefgh12" }]);
    expect(parseRefs("[[project:x]] [[foo:abcdefgh12]]")).toEqual([]);
  });
  it("parte el mensaje en texto, chapitas y enlaces (solo http/https)", () => {
    const segs = splitMessage(`hola ${makeToken("sprint", "abcdefgh12")} ver https://proshop.lat/a?b=1, o javascript:alert(1)`);
    expect(segs.map((x) => x.type)).toEqual(["text", "ref", "text", "link", "text"]);
    const link = segs.find((x) => x.type === "link");
    expect(link && link.type === "link" && link.href).toBe("https://proshop.lat/a?b=1");
    expect(splitMessage("javascript:alert(1)").every((x) => x.type === "text")).toBe(true);
  });
  it("reemplaza lo insertado por su marca", () => {
    const t = makeToken("issue", "abcdefgh12");
    expect(applyInsertedRefs("mirá #SAI-2 Pantalla ya", [{ text: "#SAI-2 Pantalla", token: t }])).toBe(`mirá ${t} ya`);
  });
  it("texto plano y colores", () => {
    expect(plainText(`hola ${makeToken("user", "abcdefgh12")}`, () => "@Ana")).toBe("hola @Ana");
    expect(isValidChatColor("#6d28d9")).toBe(true);
    expect(isValidChatColor("red")).toBe(false);
  });
});

describe("respuestas del chat", () => {
  it("arma el resumen citado", () => {
    expect(snippetOf("hola   mundo", false)).toBe("hola mundo");
    expect(snippetOf("", true)).toBe("Archivo adjunto");
    expect(snippetOf(`mirá ${makeToken("issue", "abcdefgh12")}`, false)).toBe("mirá [ticket]");
    expect(snippetOf("x".repeat(300), false).length).toBe(110);
  });
});

describe("token IA", () => {
  it("permite solo lo acordado", () => {
    const ok: Array<[string, string]> = [
      ["GET", "/api/ai/projects"], ["GET", "/api/ai/projects/abc123"], ["GET", "/api/ai/users"], ["POST", "/api/ai/import"],
      ["POST", "/api/projects"], ["PATCH", "/api/projects/abc123"], ["POST", "/api/projects/abc123/issues"], ["POST", "/api/projects/abc123/sprints"],
      ["PATCH", "/api/issues/abc123"], ["POST", "/api/issues/abc123/comments"], ["POST", "/api/projects/abc123/notes"], ["GET", "/api/issues/by-key/SAI-2"],
    ];
    for (const [m, p] of ok) expect(isAllowedForToken(m, p), `${m} ${p}`).toBe(true);
    const no: Array<[string, string]> = [
      ["DELETE", "/api/projects/abc123"], ["DELETE", "/api/issues/abc123"], ["POST", "/api/sprints/abc123/start"], ["POST", "/api/sprints/abc123/complete"],
      ["GET", "/api/users"], ["POST", "/api/users"], ["GET", "/api/tokens"], ["POST", "/api/tokens"], ["PATCH", "/api/projects/abc123/telegram"],
      ["POST", "/api/projects/abc123/telegram"], ["POST", "/api/push/subscribe"], ["PATCH", "/api/users/me"], ["POST", "/api/statuses"], ["POST", "/api/projects/abc123/discord-webhook"],
      ["GET", "/api/ai/projects/abc/extra"], ["POST", "/api/ai/projects"],
    ];
    for (const [m, p] of no) expect(isAllowedForToken(m, p), `${m} ${p}`).toBe(false);
  });
  it("borrados de token: solo tickets, notas y comentarios", () => {
    for (const p of ["/api/issues/abc123", "/api/notes/abc123", "/api/comments/abc123"]) expect(isDeletableByToken("DELETE", p), p).toBe(true);
    for (const p of ["/api/projects/abc123", "/api/sprints/abc123", "/api/users/abc123", "/api/workspaces/leave", "/api/issues/abc/comments", "/api/tokens"]) expect(isDeletableByToken("DELETE", p), p).toBe(false);
    expect(isDeletableByToken("GET", "/api/issues/abc123")).toBe(false);
    expect(isAllowedForToken("DELETE", "/api/issues/abc123")).toBe(false);
  });
  it("valida y cuenta una importación", () => {
    const input = importSchema.parse({
      project: { name: "Demo" },
      epics: [{ title: "E1", stories: [{ title: "S1", tasks: [{ title: "T1" }, { title: "T2", type: "BUG" }] }], tasks: [{ title: "T3" }] }],
      stories: [{ title: "S2" }],
      tasks: [{ title: "T4" }],
    });
    expect(countIssues(input)).toBe(1 + 1 + 2 + 1 + 1 + 1);
    expect(importSchema.safeParse({ project: {} }).success).toBe(false);
    expect(importSchema.safeParse({ project: { name: "x" }, tasks: [{ title: "t", priority: "ENORME" }] }).success).toBe(false);
    expect(issueKeyOf("TASK", "  Hola ")).toBe("TASK:hola");
  });
  it("encuentra personas por email o nombre sin acentos", () => {
    const m = [{ id: "1", name: "María Pérez", email: "maria@x.com" }, { id: "2", name: "Juan Gómez", email: "juan@x.com" }, { id: "3", name: "Juan López", email: "jl@x.com" }];
    expect(matchMember(m, "MARIA@x.com")?.id).toBe("1");
    expect(matchMember(m, "maria perez")?.id).toBe("1");
    expect(matchMember(m, "Maria")?.id).toBe("1");
    expect(matchMember(m, "Juan")).toBeNull(); // ambiguo
    expect(matchMember(m, "Nadie")).toBeNull();
  });
});

describe("perfil público: resumen semanal", () => {
  it("calcula las ventanas de 7 días", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const w = weekWindow(now);
    expect(now.getTime() - w.since.getTime()).toBe(WEEK_MS);
    expect(w.sinceDay).toBe("2026-11-03");
    expect(w.prevSinceDay).toBe("2026-10-27");
  });
  it("compara con la semana pasada", () => {
    expect(compareLabel(5, 2)).toEqual({ text: "+3 vs semana pasada", tone: "up" });
    expect(compareLabel(1, 4)).toEqual({ text: "−3 vs semana pasada", tone: "down" });
    expect(compareLabel(2, 2).tone).toBe("same");
  });
  it("junta la actividad por proyecto y ordena", () => {
    const rows = mergeProjectActivity(
      [new Map([["a", 2], ["b", 1]]), new Map([["b", 3]]), new Map([["c", 1]]), new Map()],
      ["open", "completed", "created", "notes"]
    );
    expect(rows.map((r) => r.projectId)).toEqual(["b", "a", "c"]);
    expect(rows[0]).toMatchObject({ projectId: "b", open: 1, completed: 3 });
    expect(mergeProjectActivity([new Map([["x", 0]])], ["open"])).toEqual([]);
  });
});

describe("roles por equipo", () => {
  it("mapea al rol que usa el resto de la app", () => {
    expect(toLegacyRole("OWNER")).toBe("LEAD");
    expect(toLegacyRole("ADMIN")).toBe("LEAD");
    expect(toLegacyRole("MEMBER")).toBe("MEMBER");
  });
  it("arma la marca de rol", () => {
    expect(roleBadge("OWNER", "ProShop")).toBe("DUEÑO DE ProShop");
    expect(roleBadge("ADMIN", "Acme")).toBe("ADMIN DE Acme");
    expect(roleBadge("MEMBER", "Acme")).toBe("MIEMBRO DE Acme");
  });
  it("ante un rol raro, el de menos permisos", () => {
    expect(normalizeRole("OWNER")).toBe("OWNER");
    expect(normalizeRole("superadmin")).toBe("MEMBER");
    expect(normalizeRole(null)).toBe("MEMBER");
  });
  it("migra los roles antiguos", () => {
    expect(migratedRole("LEAD", true)).toBe("OWNER");
    expect(migratedRole("LEAD", false)).toBe("ADMIN");
    expect(migratedRole("MEMBER", false)).toBe("MEMBER");
  });
  it("no deja un equipo sin dueño", () => {
    expect(canRemoveOrDemote(1, "OWNER")).toBe(false);
    expect(canRemoveOrDemote(2, "OWNER")).toBe(true);
    expect(canRemoveOrDemote(1, "ADMIN")).toBe(true);
  });
  it("genera slugs únicos", () => {
    expect(slugify("Mi Equipo Ñandú!")).toBe("mi-equipo-nandu");
    expect(slugify("¡¡¡")).toBe("equipo");
    expect(uniqueSlug("ProShop", ["proshop"])).toBe("proshop-2");
    expect(uniqueSlug("ProShop", ["proshop", "proshop-2"])).toBe("proshop-3");
  });
});

describe("cambios de rol e invitaciones", () => {
  it("quién puede cambiar qué", () => {
    expect(canChangeRole("MEMBER", "MEMBER", "ADMIN", 1).ok).toBe(false);
    expect(canChangeRole("ADMIN", "MEMBER", "ADMIN", 1).ok).toBe(true);
    expect(canChangeRole("ADMIN", "ADMIN", "MEMBER", 1).ok).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "OWNER", 1).ok).toBe(false);
    expect(canChangeRole("ADMIN", "OWNER", "ADMIN", 2).ok).toBe(false);
    expect(canChangeRole("OWNER", "MEMBER", "OWNER", 1).ok).toBe(true);
    expect(canChangeRole("OWNER", "OWNER", "ADMIN", 2).ok).toBe(true);
  });
  it("nunca deja el equipo sin dueño", () => {
    const r = canChangeRole("OWNER", "OWNER", "MEMBER", 1);
    expect(r.ok).toBe(false);
  });
  it("estado de una invitación", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const base = { expiresAt: new Date("2026-11-12T00:00:00Z"), acceptedAt: null, revokedAt: null };
    expect(invitationState(base, now)).toBe("ok");
    expect(invitationState({ ...base, expiresAt: new Date("2026-11-09T00:00:00Z") }, now)).toBe("expired");
    expect(invitationState({ ...base, acceptedAt: now }, now)).toBe("used");
    expect(invitationState({ ...base, revokedAt: now, acceptedAt: now }, now)).toBe("revoked");
    expect(inviteExpiry(now).toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
  it("normaliza emails y el tope de equipos", () => {
    expect(normalizeEmail("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
    expect(maxOwnedTeams(undefined)).toBe(3);
    expect(maxOwnedTeams("5")).toBe(5);
    expect(maxOwnedTeams("0")).toBe(3);
    expect(maxOwnedTeams("abc")).toBe(3);
  });
});

describe("secretBox", () => {
  it("cifra y descifra, y no deja la clave en claro", async () => {
    process.env.SECRETS_KEY = "prueba";
    const { encryptSecret, decryptSecret } = await import("../secretBox");
    const blob = encryptSecret("AIzaSy-clave-secreta");
    expect(blob).not.toContain("clave-secreta");
    expect(decryptSecret(blob)).toBe("AIzaSy-clave-secreta");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
    expect(decryptSecret(blob.slice(0, -3) + "AAA")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});

import { parseCommand, matchNames, isCommand, personaQuery } from "./chatCommands";

describe("comandos del chat", () => {
  it("detecta comandos", () => {
    expect(isCommand("/noti general hola")).toBe(true);
    expect(isCommand("  /reunion mañana: x")).toBe(true);
    expect(isCommand("hola /noti")).toBe(false);
    expect(isCommand("/notificar")).toBe(false);
  });
  it("noti general y slack", () => {
    expect(parseCommand("/noti general Hay deploy")).toEqual({ ok: true, command: { kind: "general", message: "Hay deploy", level: "normal" } });
    expect(parseCommand("/noti slack  hola ")).toEqual({ ok: true, command: { kind: "slack", message: "hola", level: "normal" } });
    expect(parseCommand("/noti general").ok).toBe(false);
    expect(parseCommand("/noti nada hola").ok).toBe(false);
  });
  it("noti persona con varias personas separadas por coma", () => {
    expect(parseCommand("/noti persona Ana, @luis ,ana: revisen el PR: urgente")).toEqual({ ok: true, command: { kind: "persona", names: ["ana", "luis"], message: "revisen el PR: urgente", level: "normal" } });
    expect(parseCommand("/noti persona ana revisa").ok).toBe(false);
    expect(parseCommand("/noti persona : hola").ok).toBe(false);
  });
  it("reunion con hora", () => {
    expect(parseCommand("/reunion mañana 10:30: revisión del sprint")).toEqual({ ok: true, command: { kind: "reunion", when: "mañana 10:30", topic: "revisión del sprint", level: "normal" } });
    expect(parseCommand("/reunion viernes: retro")).toEqual({ ok: true, command: { kind: "reunion", when: "viernes", topic: "retro", level: "normal" } });
    expect(parseCommand("/reunion sin tema").ok).toBe(false);
  });
  it("acepta el mensaje entre < > y sugiere nombres", () => {
    expect(parseCommand("/noti persona Jonathan <Hola>")).toEqual({ ok: true, command: { kind: "persona", names: ["jonathan"], message: "Hola", level: "normal" } });
    expect(personaQuery("/noti persona ana, lu")).toEqual({ query: "lu", start: 19 });
    expect(personaQuery("/noti persona ")).toEqual({ query: "", start: 14 });
    expect(personaQuery("/noti persona ana: hola")).toBeNull();
    expect(personaQuery("/noti general x")).toBeNull();
  });
  it("niveles urgente y ayuda", () => {
    expect(parseCommand("/urgente se cayó el servidor")).toEqual({ ok: true, command: { kind: "general", message: "se cayó el servidor", level: "urgente" } });
    expect(parseCommand("/ayuda necesito ayuda para configurar esto")).toEqual({ ok: true, command: { kind: "general", message: "necesito ayuda para configurar esto", level: "ayuda" } });
    expect(parseCommand("/urgente").ok).toBe(false);
    expect(parseCommand("/noti !urgente general deploy roto")).toEqual({ ok: true, command: { kind: "general", message: "deploy roto", level: "urgente" } });
    expect(parseCommand("/reunion !urgente ahora: incidente")).toEqual({ ok: true, command: { kind: "reunion", when: "ahora", topic: "incidente", level: "urgente" } });
    expect(parseCommand("/noti !ayuda persona ana: ¿me ayudas?")).toEqual({ ok: true, command: { kind: "persona", names: ["ana"], message: "¿me ayudas?", level: "ayuda" } });
    expect(isCommand("/urgente x")).toBe(true);
  });
  it("busca personas por nombre", () => {
    const m = [{ id: "1", name: "Ana Pérez" }, { id: "2", name: "Luis Gómez" }, { id: "3", name: "Luisa Ríos" }];
    expect(matchNames(["ana", "luis"], m)).toEqual({ found: [m[0], m[1]], missing: [], ambiguous: [] });
    expect(matchNames(["perez"], m).missing).toEqual(["perez"]);
    expect(matchNames(["lui"], m).ambiguous).toEqual(["lui"]);
    expect(matchNames(["ANA PEREZ"], m).found).toEqual([m[0]]);
  });
});

import { findKeyMentions } from "./chat";

describe("menciones por código", () => {
  it("encuentra #SAI y #SAI-12, ignora lo que ya es mención o va pegado", () => {
    expect(findKeyMentions("mira #sai y #SAI-12 ok")).toEqual([
      { start: 5, end: 9, key: "SAI", number: null },
      { start: 12, end: 19, key: "SAI", number: 12 },
    ]);
    expect(findKeyMentions("[[project:abc]] #SAI")).toHaveLength(1);
    expect(findKeyMentions("correo a#SAI")).toEqual([]);
    expect(findKeyMentions("#SAI-")).toEqual([]);
    expect(findKeyMentions("#TOOLONGKEY")).toEqual([]);
  });
});

import { parseMarkdown, parseInline, safeHref } from "./markdown";

describe("markdown seguro", () => {
  it("enlaces: solo http, https y mailto", () => {
    expect(safeHref("https://a.com/x?y=1")).toBe("https://a.com/x?y=1");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(parseInline("[x](javascript:alert(1))").some((n) => n.t === "link")).toBe(false);
  });
  it("inline: negrita, cursiva, código, enlaces y enlaces sueltos", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { t: "text", v: "a " }, { t: "bold", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " }, { t: "em", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " }, { t: "code", v: "d" },
    ]);
    const l = parseInline("ver https://drive.google.com/file/d/1, ok");
    expect(l[1]).toEqual({ t: "link", href: "https://drive.google.com/file/d/1", c: [{ t: "text", v: "https://drive.google.com/file/d/1" }] });
    expect(parseInline("[Doc](https://a.com)")).toEqual([{ t: "link", href: "https://a.com", c: [{ t: "text", v: "Doc" }] }]);
  });
  it("bloques: títulos, listas, citas y código; el HTML queda como texto", () => {
    const b = parseMarkdown("# Título\n\n- uno\n- dos\n\n1. a\n2. b\n\n> cita\n\n```\ncódigo **no negrita**\n```\n<script>alert(1)</script>");
    expect(b.map((x) => x.t)).toEqual(["h", "ul", "ol", "quote", "pre", "p"]);
    expect(b[4]).toEqual({ t: "pre", v: "código **no negrita**" });
    expect(b[5]).toEqual({ t: "p", c: [{ t: "text", v: "<script>alert(1)</script>" }] });
  });
});

import { normalizeTags, parseTags, normalizeUrl, linkService } from "./resources";

describe("archivos y enlaces", () => {
  it("etiquetas: limpia, sin repetidas y con tope", () => {
    expect(normalizeTags(" Brief , brief, Contrato  final ,, ")).toEqual(["Brief", "Contrato final"]);
    expect(normalizeTags(["a", "b", 3, "A"])).toEqual(["a", "b"]);
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(parseTags("no json")).toEqual([]);
    expect(parseTags('["x","y"]')).toEqual(["x", "y"]);
  });
  it("enlaces: solo http/https y se completa el https", () => {
    expect(normalizeUrl("https://drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(normalizeUrl("drive.google.com/file/d/1")).toBe("https://drive.google.com/file/d/1");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://x.com/a")).toBeNull();
    expect(normalizeUrl("hola mundo")).toBeNull();
    expect(linkService("https://docs.google.com/document/d/1")).toBe("Google Drive");
    expect(linkService("https://www.figma.com/file/x")).toBe("Figma");
    expect(linkService("https://ejemplo.com/a")).toBe("ejemplo.com");
  });
});

import { findMentioned } from "./mentions";
import { isOverdue } from "./checklist";

describe("menciones en comentarios y fechas del checklist", () => {
  const gente = [{ id: "1", name: "Ana Pérez" }, { id: "2", name: "Luis Gómez" }, { id: "3", name: "Luisa Ríos" }, { id: "4", name: "Mariana" }];
  it("encuentra por nombre completo o por primer nombre único", () => {
    expect(findMentioned("hola @Ana Pérez revisa", gente).map((p) => p.id)).toEqual(["1"]);
    expect(findMentioned("@ana y @MARIANA", gente).map((p) => p.id)).toEqual(["1", "4"]);
    expect(findMentioned("@luis", gente).map((p) => p.id)).toEqual(["2"]);
    expect(findMentioned("@luisa y @luis gómez", gente).map((p) => p.id).sort()).toEqual(["2", "3"]);
  });
  it("no confunde correos ni nombres parciales", () => {
    expect(findMentioned("escribe a x@ana.com", gente)).toEqual([]);
    expect(findMentioned("@anabel", gente)).toEqual([]);
    expect(findMentioned("sin menciones", gente)).toEqual([]);
  });
  it("paso vencido solo si no está hecho y la fecha ya pasó", () => {
    expect(isOverdue({ id: "a", text: "x", done: false, due: "2026-01-01" }, "2026-02-01")).toBe(true);
    expect(isOverdue({ id: "a", text: "x", done: true, due: "2026-01-01" }, "2026-02-01")).toBe(false);
    expect(isOverdue({ id: "a", text: "x", done: false, due: "2026-02-01" }, "2026-02-01")).toBe(false);
    expect(isOverdue({ id: "a", text: "x", done: false }, "2026-02-01")).toBe(false);
  });
});

import { friendlyTitle, previewUrl } from "./resources";

describe("enlaces de Drive: nombre y vista previa", () => {
  it("nombre amable según el tipo de enlace", () => {
    expect(friendlyTitle("https://docs.google.com/document/d/1AbCdEfGhIjK/edit")).toBe("Documento de Google");
    expect(friendlyTitle("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit#gid=0")).toBe("Hoja de cálculo de Google");
    expect(friendlyTitle("https://drive.google.com/drive/folders/1AbCdEfGhIjK")).toBe("Carpeta de Google Drive");
    expect(friendlyTitle("https://drive.google.com/file/d/1AbCdEfGhIjK/view")).toBe("Archivo de Google Drive");
    expect(friendlyTitle("https://ejemplo.com/a/b/")).toBe("ejemplo.com/a/b");
  });
  it("vista previa: solo direcciones conocidas y con id válido", () => {
    expect(previewUrl("https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing")).toBe("https://drive.google.com/file/d/1AbCdEfGhIjK/preview");
    expect(previewUrl("https://docs.google.com/document/d/1AbCdEfGhIjK/edit")).toBe("https://docs.google.com/document/d/1AbCdEfGhIjK/preview");
    expect(previewUrl("https://drive.google.com/drive/folders/1AbCdEfGhIjK")).toBe("https://drive.google.com/embeddedfolderview?id=1AbCdEfGhIjK#list");
    expect(previewUrl("https://docs.google.com/forms/d/1AbCdEfGhIjK/edit")).toBeNull();
    expect(previewUrl("https://evil.com/file/d/1AbCdEfGhIjK")).toBeNull();
    expect(previewUrl("https://drive.google.com.evil.com/file/d/1AbCdEfGhIjK")).toBeNull();
    expect(previewUrl("https://www.figma.com/design/abc/Mi-diseno")).toContain("figma.com/embed");
  });
});

import { categoryLabel, normalizeCategory, checkCardCapacity, MAX_CARD_ITEMS, MAX_CARD_BYTES } from "./library";

describe("biblioteca: tarjetas de archivos", () => {
  it("categorías", () => {
    expect(categoryLabel("RESOLUCION_REUNION")).toBe("Resolución de reunión");
    expect(categoryLabel("loquesea")).toBe("Otro");
    expect(normalizeCategory("ACTA")).toBe("ACTA");
    expect(normalizeCategory("x")).toBe("OTRO");
  });
  it("capacidad de una tarjeta", () => {
    expect(checkCardCapacity({ items: 0, bytes: 0 }, [{ size: 1000 }, { size: 2000 }])).toBeNull();
    expect(checkCardCapacity({ items: MAX_CARD_ITEMS - 1, bytes: 0 }, [{ size: 1 }, { size: 1 }])).toMatch(/hasta 30/);
    expect(checkCardCapacity({ items: 1, bytes: MAX_CARD_BYTES - 10 }, [{ size: 20 }])).toMatch(/MB/);
  });
});
