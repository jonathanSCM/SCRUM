import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, description: true, deployUrl: true, status: { select: { id: true, name: true } }, lead: { select: { name: true } }, _count: { select: { tasks: true } } },
    });
    return NextResponse.json(projects.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, deployUrl: p.deployUrl, status: p.status, lead: p.lead?.name ?? null, tickets: p._count.tasks })));
  } catch (e) {
    return errorResponse(e);
  }
}
