import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { publishNtfy } from "@/lib/ntfy";

// Manda un aviso de prueba al teléfono de la propia persona (siempre con el texto completo, para poder verificarlo).
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const c = await prisma.ntfyChannel.findUnique({ where: { userId: auth.user.id } });
    if (!c) return NextResponse.json({ error: "Primero activa los avisos al teléfono" }, { status: 404 });
    const r = await publishNtfy(c.topic, { title: "SCRUM ProShop", body: "Los avisos al teléfono están funcionando.", url: "/home" }, { minimal: false });
    if (!r.ok) return NextResponse.json({ error: r.status === 0 ? "No se pudo conectar con el servidor de avisos" : `El servidor de avisos respondió ${r.status}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
