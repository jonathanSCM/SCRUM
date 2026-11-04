import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { changePasswordSchema, parseBody, readJson } from "@/lib/validation";

export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(changePasswordSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { passwordHash: true } });
    if (!me) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const valid = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash);
    if (!valid) return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
