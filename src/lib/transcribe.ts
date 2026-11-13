import "server-only";
import { prisma } from "@/lib/prisma";
import { openaiKeyFor } from "@/lib/teamIntegrations";
import { refreshRecording } from "@/lib/recordings";

// Transcripción del audio de las reuniones con OpenAI. Cada parte (≈10 min) se transcribe sola. El audio SE CONSERVA para que
// el equipo lo escuche y lo descargue desde la reunión (quien grabó o un líder puede borrarlo). Con DELETE_AUDIO_AFTER_TRANSCRIBE=1
// se borra apenas se transcribe, y con AUDIO_RETENTION_DAYS=N se borra el de más de N días. Sin clave de OpenAI las partes esperan.

const MAX_ATTEMPTS = 5;
const STALE_MS = 10 * 60_000;
const MODEL = () => process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const LANGUAGE = () => process.env.OPENAI_TRANSCRIBE_LANGUAGE || "es";
const BASE_URL = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

export class TranscribeError extends Error {
  fatal: boolean; // el audio no se puede transcribir: no tiene sentido reintentar
  auth: boolean; // la clave no sirve: se espera a que la cambien
  constructor(message: string, o: { fatal?: boolean; auth?: boolean } = {}) {
    super(message);
    this.fatal = !!o.fatal;
    this.auth = !!o.auth;
  }
}

export async function transcribeAudio(data: Uint8Array, mimeType: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType }), mimeType.includes("mp4") ? "audio.mp4" : "audio.webm");
  form.append("model", MODEL());
  form.append("language", LANGUAGE());
  form.append("response_format", "json");
  let res: Response;
  try {
    res = await fetchImpl(`${BASE_URL()}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(170_000) });
  } catch {
    throw new TranscribeError("No se pudo conectar con OpenAI");
  }
  if (res.status === 401 || res.status === 403) throw new TranscribeError("La clave de OpenAI no es válida o no tiene permiso", { auth: true });
  if (res.status === 400 || res.status === 413 || res.status === 415) {
    const detail = (await res.json().catch(() => null))?.error?.message;
    throw new TranscribeError(`OpenAI no pudo leer el audio${detail ? `: ${String(detail).slice(0, 120)}` : ""}`, { fatal: true });
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    if (body?.error?.code === "insufficient_quota") throw new TranscribeError("La cuenta de OpenAI se quedó sin saldo", { auth: true });
    throw new TranscribeError("OpenAI pidió esperar (límite de uso)");
  }
  if (!res.ok) throw new TranscribeError(`OpenAI respondió ${res.status}`);
  const json = (await res.json().catch(() => null)) as { text?: string } | null;
  return (json?.text ?? "").trim();
}

let running = false;

// Procesa las partes pendientes (de a pocas por vuelta). Seguro de llamar muchas veces y desde varias copias del servidor.
export async function processPendingTranscriptions(limit = 4): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    // Las que se quedaron "trabajando" (el servidor se reinició) vuelven a la fila.
    await prisma.audioPart.updateMany({ where: { status: "WORKING", workedAt: { lt: new Date(Date.now() - STALE_MS) } }, data: { status: "PENDING" } });
    const candidates = await prisma.audioPart.findMany({ where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } }, orderBy: { createdAt: "asc" }, take: limit * 3, select: { id: true, recording: { select: { id: true, workspaceId: true } } } });
    const keys = new Map<string, string | null>();
    for (const c of candidates) {
      if (done >= limit) break;
      const ws = c.recording.workspaceId;
      if (!keys.has(ws)) keys.set(ws, await openaiKeyFor(ws));
      const key = keys.get(ws);
      if (!key) continue; // equipo sin clave: la parte espera
      const claimed = await prisma.audioPart.updateMany({ where: { id: c.id, status: "PENDING" }, data: { status: "WORKING", workedAt: new Date() } });
      if (claimed.count === 0) continue;
      const part = await prisma.audioPart.findUnique({ where: { id: c.id } });
      if (!part || !part.data) {
        await prisma.audioPart.update({ where: { id: c.id }, data: { status: "FAILED" } });
        await refreshRecording(c.recording.id);
        continue;
      }
      await refreshRecording(c.recording.id);
      try {
        const text = await transcribeAudio(new Uint8Array(part.data), part.mimeType, key);
        // El audio se conserva (se puede escuchar y descargar), salvo que el servidor pida borrarlo al transcribir.
        const dropAudio = process.env.DELETE_AUDIO_AFTER_TRANSCRIBE === "1";
        await prisma.audioPart.update({ where: { id: c.id }, data: { status: "DONE", text, workedAt: null, ...(dropAudio ? { data: null } : {}) } });
        await prisma.meetingRecording.update({ where: { id: c.recording.id }, data: { error: null } });
        done++;
      } catch (e) {
        const err = e instanceof TranscribeError ? e : new TranscribeError("Error inesperado al transcribir");
        if (err.auth) {
          // La clave no sirve: no se gasta ningún intento; se espera a que la cambien.
          await prisma.audioPart.update({ where: { id: c.id }, data: { status: "PENDING", workedAt: null } });
          keys.set(ws, null);
        } else {
          const attempts = part.attempts + 1;
          await prisma.audioPart.update({ where: { id: c.id }, data: { status: err.fatal || attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts, workedAt: null } });
        }
        await prisma.meetingRecording.update({ where: { id: c.recording.id }, data: { error: err.message } });
      }
      await refreshRecording(c.recording.id);
    }
    return done;
  } finally {
    running = false;
  }
}

// Retención opcional del audio: con AUDIO_RETENTION_DAYS=N se borra el audio (no la transcripción) de más de N días.
export async function purgeOldAudio(now: Date = new Date()): Promise<number> {
  const days = Number(process.env.AUDIO_RETENTION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const res = await prisma.audioPart.updateMany({ where: { status: "DONE", data: { not: null }, createdAt: { lt: new Date(now.getTime() - days * 86_400_000) } }, data: { data: null } });
  return res.count;
}
