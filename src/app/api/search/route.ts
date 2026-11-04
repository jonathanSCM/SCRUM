import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { formatIssueKey } from "@/lib/scrum/issueKey";

// Índice liviano para el buscador (Cmd+K): se pide una sola vez al abrirlo y
// se filtra en el navegador. El dataset es chico (decenas de proyectos,
// cientos de tickets), así que no hace falta paginar.
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  const [projects, issues] = await Promise.all([
    prisma.project.findMany({ select: { id: true, key: true, name: true } }),
    prisma.task.findMany({
      select: { id: true, number: true, title: true, description: true, issueType: true, status: true, projectId: true, project: { select: { key: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
  ]);

  return NextResponse.json({
    projects,
    issues: issues.map((i) => ({
      id: i.id,
      key: formatIssueKey(i.project.key, i.number),
      title: i.title,
      snippet: i.description.slice(0, 240),
      issueType: i.issueType,
      status: i.status,
      projectId: i.projectId,
      projectName: i.project.name,
    })),
  });
}
