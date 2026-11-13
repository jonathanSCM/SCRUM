import { zonedParts, zonedToUtc } from "./countries";

// Entiende el "cuándo" de /reunion escrito a mano ("mañana 10:30", "viernes 3pm", "15/11 9:00", "hoy a las 16h")
// con la zona horaria de quien lo escribe. Si no lo entiende, devuelve null (y se pide usar el botón con calendario).

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Ymd = { y: number; m: number; d: number };
const addDays = ({ y, m, d }: Ymd, n: number): Ymd => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const dow = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const cmp = (a: Ymd, b: Ymd) => a.y - b.y || a.m - b.m || a.d - b.d;

function parseTime(t: string): { h: number; mi: number; rest: string } | null {
  let m: RegExpMatchArray | null;
  // 10:30, 10:30 am, 3:15pm
  if ((m = t.match(/(?:a las |a la |las |la )?\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/))) {
    let h = Number(m[1]);
    const mi = Number(m[2]);
    const ap = m[3]?.[0];
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return { h, mi, rest: t.replace(m[0], " ") };
  }
  // 3pm, 9 am
  if ((m = t.match(/(?:a las |a la |las |la )?\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/))) {
    let h = Number(m[1]);
    const ap = m[2][0];
    if (h < 1 || h > 12) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return { h, mi: 0, rest: t.replace(m[0], " ") };
  }
  // 16h, 16 hs, 16 horas
  if ((m = t.match(/\b(\d{1,2})\s*(h|hs|hrs|horas)\b/))) {
    const h = Number(m[1]);
    if (h > 23) return null;
    return { h, mi: 0, rest: t.replace(m[0], " ") };
  }
  // a las 15 / a las 9
  if ((m = t.match(/\ba las? (\d{1,2})\b/))) {
    const h = Number(m[1]);
    if (h > 23) return null;
    return { h, mi: 0, rest: t.replace(m[0], " ") };
  }
  if ((m = t.match(/\bmediodia\b/))) return { h: 12, mi: 0, rest: t.replace(m[0], " ") };
  return null;
}

export function parseWhen(text: string, tz: string, now: Date = new Date()): Date | null {
  const t0 = norm(text);
  if (!t0) return null;
  const time = parseTime(t0);
  if (!time) return null;
  let rest = time.rest;
  const p = zonedParts(now, tz);
  const today: Ymd = { y: p.year, m: p.month, d: p.day };
  const nowMin = p.hour * 60 + p.minute;
  const when = time.h * 60 + time.mi;
  let day: Ymd | null = null;
  let m: RegExpMatchArray | null;

  if ((m = rest.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) {
    day = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  } else if ((m = rest.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/))) {
    const yr = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    day = { y: yr ?? today.y, m: Number(m[2]), d: Number(m[1]) };
    if (!yr && cmp(day, today) < 0) day.y += 1;
  } else if ((m = rest.match(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")})(?: de (\\d{4}))?\\b`)))) {
    const yr = m[3] ? Number(m[3]) : null;
    day = { y: yr ?? today.y, m: MONTHS.indexOf(m[2]) + 1, d: Number(m[1]) };
    if (!yr && cmp(day, today) < 0) day.y += 1;
  } else if (/\bpasado manana\b/.test(rest)) day = addDays(today, 2);
  else if (/\bmanana\b/.test(rest)) day = addDays(today, 1);
  else if (/\bhoy\b/.test(rest)) day = today;
  else {
    const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(rest));
    if (wd >= 0) {
      let diff = (wd - dow(today) + 7) % 7;
      if (diff === 0 && when <= nowMin) diff = 7; // "el lunes" dicho un lunes a una hora que ya pasó: el próximo
      day = addDays(today, diff);
    }
  }
  // Solo una hora ("15:00"): hoy si todavía no pasó; si no, mañana.
  if (!day) {
    const onlyTime = rest.replace(/\b(a|el|la|las|de|para|hoy)\b/g, "").replace(/[\s,.:;-]/g, "");
    if (onlyTime) return null;
    day = when > nowMin ? today : addDays(today, 1);
  }
  if (day.m < 1 || day.m > 12 || day.d < 1 || day.d > 31) return null;
  const utc = zonedToUtc(day.y, day.m, day.d, time.h, time.mi, tz);
  return Number.isNaN(utc.getTime()) ? null : utc;
}
