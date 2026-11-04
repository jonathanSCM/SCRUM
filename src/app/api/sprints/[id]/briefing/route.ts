import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { sprintPdfEnabled } from "@/lib/features";
import { errorResponse, notFound } from "@/lib/api";
import { sendSprintBriefing } from "@/lib/sprintBriefing";

export const maxDuration = 90;

// Reenvía el informe del sprint al Slack del proyecto.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  if (!sprintPdfEnabled()) return notFound("El informe PDF del sprint está desactivado (SPRINT_PDF_ENABLED)");
  const { id } = await params;

  try {
    const sprint = await prisma.sprint.findUnique({ where: { id }, select: { id: true } });
    if (!sprint) return notFound("Sprint no encontrado");
    const result = await sendSprintBriefing(id, auth.user);
    if (result.delivered === "none") {
      return NextResponse.json({ error: "No se pudo enviar: configurá Slack en los Ajustes del proyecto (webhook, o bot + canal para adjuntar el PDF)." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
