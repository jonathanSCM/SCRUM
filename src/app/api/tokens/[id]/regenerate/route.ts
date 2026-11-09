import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { generateToken, hashToken } from "@/lib/apiToken";
import { encryptSecret } from "@/lib/secretBox";

// Cambia el valor del token (el anterior deja de funcionar) conservando su nombre y permisos.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const token = generateToken();
    const res = await prisma.apiToken.updateMany({ where: { id, userId: auth.user.id }, data: { tokenHash: hashToken(token), tokenEnc: encryptSecret(token), prefix: token.slice(0, 10), lastUsedAt: null } });
    if (res.count === 0) return notFound("Token no encontrado");
    return NextResponse.json({ token, prefix: token.slice(0, 10) });
  } catch (e) {
    return errorResponse(e);
  }
}
