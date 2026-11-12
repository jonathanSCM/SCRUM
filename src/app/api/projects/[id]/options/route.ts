import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { getProjectOptions } from "@/lib/projectData";

// Miembros, épicas y sprints del proyecto (para crear un ticket desde cualquier pantalla).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { key: true } });
    return NextResponse.json(await getProjectOptions(id, project?.key ?? null), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
