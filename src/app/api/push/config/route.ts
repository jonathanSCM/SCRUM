import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

// El navegador necesita la clave pública VAPID para suscribirse.
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ enabled: pushConfigured(), publicKey: vapidPublicKey() });
}
