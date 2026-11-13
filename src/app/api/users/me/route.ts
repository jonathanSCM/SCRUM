import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { defaultZoneOf, findCountry, isValidTimeZone } from "@/lib/scrum/countries";
import { parseBody, readJson, updateProfileSchema } from "@/lib/validation";

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  try {
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, name: true, email: true, role: true, discordUserId: true, telegramUsername: true, slackUserId: true, chatColor: true, tagline: true, country: true, timezone: true },
    });
    if (!me) return notFound("Usuario no encontrado");
    return NextResponse.json(me);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(updateProfileSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // País y zona horaria: el país debe ser de la lista y la zona, válida (si no se manda zona, la del país).
  let zone: { country: string | null; timezone: string | null } | null = null;
  if (body.country !== undefined || body.timezone !== undefined) {
    const code = body.country ? body.country.toUpperCase() : null;
    if (code && !findCountry(code)) return NextResponse.json({ error: "País no disponible" }, { status: 400 });
    const tz = body.timezone || (code ? defaultZoneOf(code) : null);
    if (tz && !isValidTimeZone(tz)) return NextResponse.json({ error: "Zona horaria inválida" }, { status: 400 });
    if (code && tz && !findCountry(code)!.zones.some((z) => z.tz === tz)) return NextResponse.json({ error: "Esa zona no es de ese país" }, { status: 400 });
    zone = { country: code, timezone: tz };
  }

  try {
    const me = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.discordUserId !== undefined ? { discordUserId: body.discordUserId || null } : {}),
        ...(body.tagline !== undefined ? { tagline: body.tagline || null } : {}),
        ...(body.chatColor !== undefined ? { chatColor: body.chatColor || null } : {}),
        ...(body.slackUserId !== undefined ? { slackUserId: body.slackUserId || null } : {}),
        ...(body.telegramUsername !== undefined ? { telegramUsername: body.telegramUsername || null } : {}),
        ...(zone ? { country: zone.country, timezone: zone.timezone } : {}),
      },
      select: { id: true, name: true, email: true, role: true, discordUserId: true, telegramUsername: true, slackUserId: true, chatColor: true, tagline: true, country: true, timezone: true },
    });
    // Los avisos (horas de silencio, resúmenes) usan la misma zona.
    if (zone?.timezone) await prisma.notifPrefs.upsert({ where: { userId: auth.user.id }, create: { userId: auth.user.id, tz: zone.timezone }, update: { tz: zone.timezone } });
    return NextResponse.json(me);
  } catch (e) {
    return errorResponse(e);
  }
}
