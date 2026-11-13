import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { generateToken, hashToken } from "@/lib/apiToken";
import { encryptSecret } from "@/lib/secretBox";

// Conecta la extensión de Chrome a la cuenta de quien tiene la sesión abierta: crea su token de extensión
// (reemplaza al anterior, si había) y lo devuelve una sola vez para que la página lo entregue a la extensión.
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const token = generateToken();
    await prisma.$transaction([
      prisma.apiToken.deleteMany({ where: { userId: auth.user.id, scope: "EXTENSION" } }),
      prisma.apiToken.create({ data: { userId: auth.user.id, scope: "EXTENSION", name: "Extensión de Meet", tokenHash: hashToken(token), tokenEnc: encryptSecret(token), prefix: token.slice(0, 10) } }),
    ]);
    return NextResponse.json({ token, name: auth.user.name });
  } catch (e) {
    return errorResponse(e);
  }
}

// Desconecta la extensión (borra su token).
export async function DELETE() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  await prisma.apiToken.deleteMany({ where: { userId: auth.user.id, scope: "EXTENSION" } });
  return NextResponse.json({ ok: true });
}
