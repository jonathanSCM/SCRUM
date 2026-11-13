import { NextResponse } from "next/server";
import { authExtension, teamsOf } from "@/lib/extensionAuth";
import { activeAccess } from "@/lib/workspace";

// Quién es la persona de la extensión y a qué equipos puede mandar reuniones.
// (La extensión llama "organizaciones" a los equipos.) Autentica con el token de la extensión, no con sesión.
export async function GET(req: Request) {
  const user = await authExtension(req);
  if (!user) return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
  const teams = await teamsOf(user.id);
  const active = await activeAccess(user.id);
  return NextResponse.json({ id: user.id, name: user.name, organizations: teams.map(({ id, name }) => ({ id, name })), activeOrganizationId: teams.find((t) => t.id === active?.workspaceId)?.id ?? teams[0]?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
}
