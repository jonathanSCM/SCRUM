import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBody, createSprintSchema } from "@/lib/validation";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sprints = await prisma.sprint.findMany({
    include: { _count: { select: { tasks: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(sprints);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = parseBody(createSprintSchema, await req.json());
  if ("error" in parsed) return parsed.error;
  const { name, startDate, endDate } = parsed.data;

  const sprint = await prisma.sprint.create({
    data: { name, startDate: new Date(startDate), endDate: new Date(endDate) },
  });
  return NextResponse.json(sprint, { status: 201 });
}
