import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { contactSchema, parseBody, readJson } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(contactSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");
    const contact = await prisma.projectContact.create({ data: { projectId: id, ...parsed.data } });
    return NextResponse.json(contact, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
