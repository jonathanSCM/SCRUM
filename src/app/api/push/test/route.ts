import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { pushConfigured, sendPush } from "@/lib/push";

// Manda una notificación de prueba a los dispositivos del usuario actual.
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  if (!pushConfigured()) return NextResponse.json({ error: "Las notificaciones del navegador no están configuradas en el servidor (VAPID)." }, { status: 400 });
  const devices = await prisma.pushSubscription.count({ where: { userId: auth.user.id } });
  if (devices === 0) return NextResponse.json({ error: "No hay ningún dispositivo suscrito. Activá las notificaciones primero." }, { status: 400 });
  const sent = await sendPush([auth.user.id], { title: "SCRUM ProShop", body: "Las notificaciones están funcionando.", url: "/home", tag: "test" });
  if (sent === 0) return NextResponse.json({ error: "No se pudo entregar la notificación: el servicio push del navegador no respondió." }, { status: 502 });
  return NextResponse.json({ sent });
}
