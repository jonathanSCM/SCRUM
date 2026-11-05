// Comandos del chat: /noti slack, /noti persona, /noti general y /reunion.
//
//   /noti slack <mensaje>                 al canal de Slack del equipo
//   /noti persona ana, luis: <mensaje>    a una o varias personas (separadas por coma; el ":" separa el mensaje)
//   /noti general <mensaje>               a todo el equipo
//   /reunion <cuándo>: <tema>             convocatoria a todo el equipo

// Nivel del aviso: "normal", "ayuda" (ámbar) o "urgente" (rojo). Atajos: /urgente <mensaje> y /ayuda <mensaje>
// (van a todo el equipo); o la marca !urgente / !ayuda después del comando: /noti !urgente general …
export type Level = "normal" | "ayuda" | "urgente";

export type ChatCommand =
  | { kind: "slack"; message: string; level: Level }
  | { kind: "general"; message: string; level: Level }
  | { kind: "persona"; names: string[]; message: string; level: Level }
  | { kind: "reunion"; when: string; topic: string; level: Level };

export type ParsedCommand = { ok: true; command: ChatCommand } | { ok: false; error: string };

export const COMMAND_HELP = "Comandos: /noti slack <mensaje> · /noti persona ana, luis: <mensaje> · /noti general <mensaje> · /reunion <cuándo>: <tema> · /urgente <mensaje> · /ayuda <mensaje> (agrega !urgente o !ayuda a cualquier comando)";

export function isCommand(body: string): boolean {
  return /^\/(noti|reunion|urgente|ayuda)(\s|$)/i.test(body.trim());
}

export function parseCommand(raw: string): ParsedCommand {
  let body = raw.trim();

  const quick = body.match(/^\/(urgente|ayuda)(?:\s+([\s\S]*))?$/i);
  if (quick) {
    const message = (quick[2] ?? "").trim();
    if (!message) return { ok: false, error: `Falta el mensaje. Uso: /${quick[1].toLowerCase()} <mensaje>` };
    return { ok: true, command: { kind: "general", message: message.slice(0, 1000), level: quick[1].toLowerCase() as Level } };
  }

  // Marca de nivel justo después del comando: "/noti !urgente general …"
  let level: Level = "normal";
  const flag = body.match(/^(\/\w+)\s+!(urgente|ayuda)(?=\s|$)\s*([\s\S]*)$/i);
  if (flag) {
    level = flag[2].toLowerCase() as Level;
    body = `${flag[1]} ${flag[3]}`.trim();
  }
  const reunion = body.match(/^\/reunion(?:\s+([\s\S]*))?$/i);
  if (reunion) {
    const rest = (reunion[1] ?? "").trim();
    const i = rest.indexOf(":");
    // La hora también lleva ":", así que el separador es el último ":" seguido de espacio; si no hay, el primero.
    const sep = rest.search(/:\s/);
    const at = sep >= 0 ? sep : i;
    const when = at > 0 ? rest.slice(0, at).trim() : "";
    const topic = at > 0 ? rest.slice(at + 1).trim() : "";
    if (!when || !topic) return { ok: false, error: "Uso: /reunion <cuándo>: <tema>. Ej.: /reunion mañana 10:30: revisión del sprint" };
    return { ok: true, command: { kind: "reunion", when: when.slice(0, 80), topic: topic.slice(0, 500), level } };
  }

  const noti = body.match(/^\/noti(?:\s+(\S+)(?:\s+([\s\S]*))?)?$/i);
  if (!noti) return { ok: false, error: COMMAND_HELP };
  const sub = (noti[1] ?? "").toLowerCase();
  const rest = (noti[2] ?? "").trim();

  if (sub === "slack" || sub === "general") {
    if (!rest) return { ok: false, error: `Falta el mensaje. Uso: /noti ${sub} <mensaje>` };
    return { ok: true, command: { kind: sub, message: rest.slice(0, 1000), level } };
  }
  if (sub === "persona" || sub === "personas") {
    const i = rest.indexOf(":");
    const names = (i > 0 ? rest.slice(0, i) : "")
      .split(",")
      .map((n) => n.trim().replace(/^@/, ""))
      .filter(Boolean);
    const message = i > 0 ? rest.slice(i + 1).trim() : "";
    if (names.length === 0 || !message) return { ok: false, error: "Uso: /noti persona ana, luis: <mensaje>" };
    return { ok: true, command: { kind: "persona", names: [...new Set(names.map((n) => n.toLowerCase()))].slice(0, 20), message: message.slice(0, 1000), level } };
  }
  return { ok: false, error: COMMAND_HELP };
}

export type NameMatch = { id: string; name: string };

// Busca personas por nombre (sin mayúsculas ni tildes): coincidencia exacta con el nombre completo o con
// el primer nombre, o que empiece con lo escrito. Devuelve las que encontró y los nombres que no (o ambiguos).
export function matchNames(names: string[], members: NameMatch[]): { found: NameMatch[]; missing: string[]; ambiguous: string[] } {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const found: NameMatch[] = [];
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const wanted of names) {
    const w = norm(wanted);
    const exact = members.filter((m) => norm(m.name) === w || norm(m.name).split(/\s+/)[0] === w);
    const hits = exact.length ? exact : members.filter((m) => norm(m.name).startsWith(w));
    if (hits.length === 1) {
      if (!found.some((f) => f.id === hits[0].id)) found.push(hits[0]);
    } else if (hits.length === 0) missing.push(wanted);
    else ambiguous.push(wanted);
  }
  return { found, missing, ambiguous };
}
