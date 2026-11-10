import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { projectVersion } from "@/lib/live";

// Versión de los tickets/sprints del proyecto (para refrescar en vivo).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ v: await projectVersion(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
