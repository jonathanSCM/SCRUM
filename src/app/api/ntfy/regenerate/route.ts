import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { newTopic, ntfyConfigured, ntfyServerUrl } from "@/lib/ntfy";

// Cambia el tema secreto (si crees que alguien lo vio). Hay que volver a suscribir el teléfono.
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    if (!ntfyConfigured()) return NextResponse.json({ error: "Los avisos al teléfono no están configurados en el servidor" }, { status: 400 });
    const r = await prisma.ntfyChannel.updateMany({ where: { userId: auth.user.id }, data: { topic: newTopic(), failures: 0, lastError: null, enabled: true } });
    if (r.count === 0) return NextResponse.json({ error: "Primero activa los avisos al teléfono" }, { status: 404 });
    const c = await prisma.ntfyChannel.findUnique({ where: { userId: auth.user.id } });
    const host = ntfyServerUrl().replace(/^https?:\/\//, "");
    return NextResponse.json({ topic: c!.topic, appLink: `ntfy://${host}/${c!.topic}`, webLink: `${ntfyServerUrl()}/${c!.topic}` });
  } catch (e) {
    return errorResponse(e);
  }
}
