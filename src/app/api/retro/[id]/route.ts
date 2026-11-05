import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ retro: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const item = await prisma.retroItem.findUnique({ where: { id }, select: { authorId: true } });
    if (!item) return notFound("No encontrado");
    if (item.authorId !== auth.user.id && auth.user.role !== "LEAD") {
      return NextResponse.json({ error: "Solo su autor o un líder puede borrarlo" }, { status: 403 });
    }
    await prisma.retroItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
