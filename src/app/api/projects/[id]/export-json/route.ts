import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { buildProjectExport } from "@/lib/exportProject";

export const runtime = "nodejs";

// Exporta el proyecto en JSON para pasárselo a una IA.
//   ?scope=tasks|full (por defecto full) · ?comments=N (0–20, por defecto 5) · ?anonymize=1 · ?download=1
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "tasks" ? "tasks" : "full";
  const comments = Math.min(20, Math.max(0, Number(url.searchParams.get("comments") ?? 5) || 0));
  try {
    const data = await buildProjectExport(id, { scope, comments, anonymize: url.searchParams.get("anonymize") === "1" });
    if (!data) return notFound("Proyecto no encontrado");
    const body = JSON.stringify(data, null, 2);
    const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
    if (url.searchParams.get("download") === "1") {
      const name = `${data.project.key ?? "proyecto"}-${scope === "tasks" ? "tareas" : "completo"}.json`;
      headers["Content-Disposition"] = `attachment; filename="${name}"`;
    }
    return new NextResponse(body, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
