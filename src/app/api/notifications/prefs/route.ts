import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { loadPrefs } from "@/lib/notifications";
import { DIGEST_OPTIONS, isTime } from "@/lib/scrum/notifPolicy";

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json((await loadPrefs([auth.user.id])).get(auth.user.id));
  } catch (e) {
    return errorResponse(e);
  }
}

// Intervalo del resumen, horas de silencio y categorías silenciadas.
export async function PUT(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(
    z.object({
      digestMinutes: z.number().refine((n) => (DIGEST_OPTIONS as readonly number[]).includes(n), "Intervalo no válido").optional(),
      quietEnabled: z.boolean().optional(),
      quietStart: z.string().refine(isTime, "Hora inválida (HH:MM)").optional(),
      quietEnd: z.string().refine(isTime, "Hora inválida (HH:MM)").optional(),
      tz: z.string().max(60).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Zona horaria inválida").optional(),
      muted: z.array(z.enum(["tickets", "assignments", "team", "sprints"])).optional(),
    }),
    await readJson(req)
  );
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const data = { ...(d.digestMinutes !== undefined ? { digestMinutes: d.digestMinutes } : {}), ...(d.quietEnabled !== undefined ? { quietEnabled: d.quietEnabled } : {}), ...(d.quietStart ? { quietStart: d.quietStart } : {}), ...(d.quietEnd ? { quietEnd: d.quietEnd } : {}), ...(d.tz ? { tz: d.tz } : {}), ...(d.muted ? { muted: JSON.stringify([...new Set(d.muted)]) } : {}) };
    await prisma.notifPrefs.upsert({ where: { userId: auth.user.id }, create: { userId: auth.user.id, ...data }, update: data });
    return NextResponse.json((await loadPrefs([auth.user.id])).get(auth.user.id));
  } catch (e) {
    return errorResponse(e);
  }
}
