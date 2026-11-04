import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateProfileSchema } from "@/lib/validation";

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  try {
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, name: true, email: true, role: true, discordUserId: true },
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

  try {
    const me = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.discordUserId !== undefined ? { discordUserId: body.discordUserId || null } : {}),
      },
      select: { id: true, name: true, email: true, role: true, discordUserId: true },
    });
    return NextResponse.json(me);
  } catch (e) {
    return errorResponse(e);
  }
}
