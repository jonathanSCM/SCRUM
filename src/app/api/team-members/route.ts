import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mainPanelFetch, isMainPanelConfigured } from "@/lib/mainPanel";

// Proxy en vivo de GET /api/users del panel interno -- no se guarda copia
// local, es solo para poblar el <select> de Encargado con datos frescos.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!isMainPanelConfigured()) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const res = await mainPanelFetch("/api/users");
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const users = await res.json();
    return NextResponse.json(users);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
