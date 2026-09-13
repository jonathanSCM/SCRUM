import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Índice liviano para el buscador (Cmd+K): se pide una sola vez al abrir el
// buscador, no en cada tecla -- el dataset es chico (decenas de proyectos y
// tareas, no miles), así que no hace falta paginar ni debouncear contra la DB.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.task.findMany({ select: { id: true, title: true, projectId: true } }),
  ]);

  return NextResponse.json({ projects, tasks });
}
