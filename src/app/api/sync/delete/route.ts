import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSyncToken } from "@/lib/syncAuth";
import { parseBody, syncDeleteSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!isValidSyncToken(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = parseBody(syncDeleteSchema, await req.json());
  if ("error" in parsed) return parsed.error;
  const { type, id } = parsed.data;

  try {
    if (type === "status") await prisma.statusOption.delete({ where: { id } });
    else if (type === "project") await prisma.project.delete({ where: { id } });
    else if (type === "task") await prisma.task.delete({ where: { id } });
    else if (type === "document") await prisma.document.delete({ where: { id } });
  } catch {
    // Ya no existía de este lado -- no pasa nada, el objetivo (que no esté) ya se cumple.
  }

  return NextResponse.json({ ok: true });
}
