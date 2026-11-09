import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { decryptSecret } from "@/lib/secretBox";

// Devuelve el token completo a su dueño (con su sesión de navegador) para volver a copiarlo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const row = await prisma.apiToken.findFirst({ where: { id, userId: auth.user.id }, select: { tokenEnc: true, allowDelete: true, name: true } });
    if (!row) return notFound("Token no encontrado");
    const token = decryptSecret(row.tokenEnc);
    if (!token) return NextResponse.json({ error: "Este token se creó antes de poder volver a copiarlo. Usa «Regenerar» para obtener uno nuevo." }, { status: 409 });
    return NextResponse.json({ token, allowDelete: row.allowDelete, name: row.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
