import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { workspaceProjectsVersion } from "@/lib/live";

// Versión de la lista de proyectos del equipo (para refrescar en vivo).
export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    const v = await workspaceProjectsVersion(auth.user.workspaceId!);
    return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
