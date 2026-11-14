// Países / regiones y zonas horarias (IANA). Cada persona elige su país en el perfil; las horas de las reuniones se
// guardan en UTC y se muestran en la zona de quien mira (con horario de verano donde lo haya).
// Código puro (lo usan el navegador, el servidor y las pruebas).

export type Zone = { tz: string; label: string };
export type Country = { code: string; name: string; zones: Zone[] };

export const COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina", zones: [{ tz: "America/Argentina/Buenos_Aires", label: "Buenos Aires" }] },
  { code: "BO", name: "Bolivia", zones: [{ tz: "America/La_Paz", label: "La Paz" }] },
  { code: "BR", name: "Brasil", zones: [{ tz: "America/Sao_Paulo", label: "Brasilia / São Paulo" }, { tz: "America/Manaus", label: "Manaos" }, { tz: "America/Rio_Branco", label: "Acre" }, { tz: "America/Noronha", label: "Fernando de Noronha" }] },
  { code: "CL", name: "Chile", zones: [{ tz: "America/Santiago", label: "Santiago" }, { tz: "Pacific/Easter", label: "Isla de Pascua" }] },
  { code: "CO", name: "Colombia", zones: [{ tz: "America/Bogota", label: "Bogotá" }] },
  { code: "CR", name: "Costa Rica", zones: [{ tz: "America/Costa_Rica", label: "San José" }] },
  { code: "CU", name: "Cuba", zones: [{ tz: "America/Havana", label: "La Habana" }] },
  { code: "DO", name: "República Dominicana", zones: [{ tz: "America/Santo_Domingo", label: "Santo Domingo" }] },
  { code: "EC", name: "Ecuador", zones: [{ tz: "America/Guayaquil", label: "Quito / Guayaquil" }, { tz: "Pacific/Galapagos", label: "Galápagos" }] },
  { code: "SV", name: "El Salvador", zones: [{ tz: "America/El_Salvador", label: "San Salvador" }] },
  { code: "ES", name: "España", zones: [{ tz: "Europe/Madrid", label: "Península y Baleares" }, { tz: "Atlantic/Canary", label: "Canarias" }] },
  { code: "US", name: "Estados Unidos", zones: [{ tz: "America/New_York", label: "Este (Nueva York)" }, { tz: "America/Chicago", label: "Centro (Chicago)" }, { tz: "America/Denver", label: "Montaña (Denver)" }, { tz: "America/Los_Angeles", label: "Pacífico (Los Ángeles)" }] },
  { code: "GT", name: "Guatemala", zones: [{ tz: "America/Guatemala", label: "Ciudad de Guatemala" }] },
  { code: "HN", name: "Honduras", zones: [{ tz: "America/Tegucigalpa", label: "Tegucigalpa" }] },
  { code: "MX", name: "México", zones: [{ tz: "America/Mexico_City", label: "Ciudad de México" }, { tz: "America/Cancun", label: "Cancún" }, { tz: "America/Hermosillo", label: "Sonora" }, { tz: "America/Tijuana", label: "Tijuana" }] },
  { code: "NI", name: "Nicaragua", zones: [{ tz: "America/Managua", label: "Managua" }] },
  { code: "PA", name: "Panamá", zones: [{ tz: "America/Panama", label: "Ciudad de Panamá" }] },
  { code: "PY", name: "Paraguay", zones: [{ tz: "America/Asuncion", label: "Asunción" }] },
  { code: "PE", name: "Perú", zones: [{ tz: "America/Lima", label: "Lima" }] },
  { code: "PR", name: "Puerto Rico", zones: [{ tz: "America/Puerto_Rico", label: "San Juan" }] },
  { code: "UY", name: "Uruguay", zones: [{ tz: "America/Montevideo", label: "Montevideo" }] },
  { code: "VE", name: "Venezuela", zones: [{ tz: "America/Caracas", label: "Caracas" }] },
];

export const DEFAULT_TZ = "America/La_Paz";

export function findCountry(code: string | null | undefined): Country | null {
  return COUNTRIES.find((c) => c.code === code) ?? null;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Zona por defecto de un país (la primera) y, si no se sabe, la de Bolivia.
export const defaultZoneOf = (code: string | null | undefined) => findCountry(code)?.zones[0].tz ?? DEFAULT_TZ;

// País al que pertenece una zona (para mostrar su nombre).
export function countryOfZone(tz: string): Country | null {
  return COUNTRIES.find((c) => c.zones.some((z) => z.tz === tz)) ?? null;
}

// ───────── Fechas y horas en una zona ─────────

// Partes de una fecha tal como se ve en `tz`.
// Crear un Intl.DateTimeFormat es caro (decenas de microsegundos): se guarda uno por zona (la actividad del equipo
// convierte decenas de miles de fechas).
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string) {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) };
}

// Diferencia (en minutos) entre la hora de `tz` y UTC en ese instante (Lima = -300, La Paz = -240).
export function offsetMinutes(date: Date, tz: string): number {
  const z = zonedParts(date, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Hora "de reloj" en `tz` (año, mes, día, hora, minuto) → el instante UTC real. Sirve para agendar: "10:00 en Lima".
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // Una segunda pasada corrige las fechas cercanas a un cambio de horario de verano.
  utc = guess - offsetMinutes(new Date(utc), tz) * 60000;
  return new Date(utc);
}

export function formatTime(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat("es", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

export function formatDay(date: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  const s = new Intl.DateTimeFormat("es", { timeZone: tz, ...opts }).format(new Date(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "UTC-5", "UTC+5:30"
export function offsetLabel(date: Date | string, tz: string): string {
  const m = offsetMinutes(new Date(date), tz);
  const sign = m < 0 ? "-" : "+";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${h}${mm ? ":" + String(mm).padStart(2, "0") : ""}`;
}

// "Lima", "La Paz": nombre corto de la zona.
export function zoneName(tz: string): string {
  for (const c of COUNTRIES) {
    const z = c.zones.find((x) => x.tz === tz);
    if (z) return c.zones.length === 1 ? c.name : `${c.name} · ${z.label}`;
  }
  return tz.split("/").pop()!.replace(/_/g, " ");
}

// "mañana", "hoy"… relativo a la zona de quien mira.
export function dayKey(date: Date | string, tz: string): string {
  const p = zonedParts(new Date(date), tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
