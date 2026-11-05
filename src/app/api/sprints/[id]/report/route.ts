import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { sprintPdfEnabled } from "@/lib/features";
import { errorResponse, notFound } from "@/lib/api";
import { buildSprintPdf } from "@/lib/sprintBriefing";

export const runtime = "nodejs";
export const maxDuration = 60;

// PDF del sprint. ?ai=0 lo genera sin llamar a Gemini (más rápido).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ sprint: (await params).id });
  if ("error" in auth) return auth.error;
  if (!sprintPdfEnabled()) return notFound("El informe PDF del sprint está desactivado (SPRINT_PDF_ENABLED)");
  const { id } = await params;
  const ai = new URL(req.url).searchParams.get("ai") !== "0";

  try {
    const built = await buildSprintPdf(id, { ai });
    if (!built) return notFound("Sprint no encontrado");
    const name = `${(built.data.project.key ?? built.data.project.name).replace(/[^\w-]+/g, "_")}-${built.data.sprint.name.replace(/[^\w-]+/g, "_")}.pdf`;
    return new Response(new Uint8Array(built.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
