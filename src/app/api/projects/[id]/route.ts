import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { parseBody, readJson, updateProjectSchema } from "@/lib/validation";
import { logHistory } from "@/lib/history";
import { notifyDiscord, resolveDiscordMention, DISCORD_COLOR } from "@/lib/discord";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const parsed = parseBody(updateProjectSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  try {
    const current = await prisma.project.findUnique({ where: { id }, include: { status: true, lead: { select: { id: true, name: true } } } });
    if (!current) return notFound("Proyecto no encontrado");

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.deployUrl !== undefined) data.deployUrl = body.deployUrl || null;
    if (body.stack !== undefined) data.stack = JSON.stringify(body.stack);

    let newStatus: { id: string; name: string } | null = null;
    if (body.statusId !== undefined && body.statusId !== current.statusId) {
      newStatus = await prisma.statusOption.findUnique({ where: { id: body.statusId } });
      if (!newStatus) return NextResponse.json({ error: "Ese estado no existe" }, { status: 400 });
      data.statusId = body.statusId;
    }

    let newLead: { id: string; name: string } | null | undefined;
    if (body.leadUserId !== undefined && body.leadUserId !== current.leadUserId) {
      newLead = body.leadUserId ? await prisma.user.findUnique({ where: { id: body.leadUserId }, select: { id: true, name: true } }) : null;
      if (body.leadUserId && !newLead) return NextResponse.json({ error: "Ese usuario no existe" }, { status: 400 });
      data.leadUserId = body.leadUserId;
    }

    const updated = await prisma.project.update({ where: { id }, data, include: { status: true, lead: { select: { id: true, name: true } } } });

    if (newStatus) {
      await logHistory({ projectId: id, field: "estado_proyecto", oldValue: current.status.name, newValue: newStatus.name, actor: user });
      const mention = await resolveDiscordMention(updated.leadUserId);
      await notifyDiscord(id, {
        title: `📌 ${updated.name}`,
        description: `El proyecto pasó de «${current.status.name}» a «${newStatus.name}»`,
        color: DISCORD_COLOR.status,
        mentionUserId: mention,
      });
    }
    if (newLead !== undefined) {
      await logHistory({ projectId: id, field: "encargado_proyecto", oldValue: current.lead?.name ?? null, newValue: newLead?.name ?? "Sin asignar", actor: user });
    }
    if (body.description !== undefined && body.description !== current.description) {
      await logHistory({ projectId: id, field: "descripcion_proyecto", newValue: "editada", actor: user });
    }

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return notFound("Proyecto no encontrado");
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
