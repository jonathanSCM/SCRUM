import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { chatMessageSchema, parseBody, readJson } from "@/lib/validation";
import { loadMessages, messageInclude, resolveRefs, toDTOs } from "@/lib/chatData";
import { parseRefs, plainText } from "@/lib/scrum/chat";
import { sendPush } from "@/lib/push";

// ?after=<ISO> devuelve solo los nuevos; ?project=<id> solo los que mencionan ese proyecto.
export async function GET(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  try {
    const valid = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;
    const messages = await loadMessages({ after: valid, projectId: url.searchParams.get("project") });
    // Mensajes borrados desde ese momento (con margen por si los relojes no coinciden al milisegundo).
    const deleted = valid
      ? (await prisma.chatDeletion.findMany({ where: { deletedAt: { gt: new Date(valid.getTime() - 10_000) } }, select: { messageId: true } })).map((d) => d.messageId)
      : [];
    return NextResponse.json({ messages, deleted });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(chatMessageSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { body, fileIds = [], replyToId = null } = parsed.data;
  if (!body && fileIds.length === 0) return NextResponse.json({ error: "Escribí un mensaje o adjuntá un archivo" }, { status: 400 });

  try {
    // Solo se conservan las referencias que existen; cada una guarda su proyecto para poder filtrar.
    const wanted = parseRefs(body);
    const resolved = await resolveRefs(wanted.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id })));
    const found = wanted.filter((r) => resolved.has(`${r.kind.toUpperCase()}:${r.id}`));

    const [issues, sprints] = await Promise.all([
      prisma.task.findMany({ where: { id: { in: found.filter((r) => r.kind === "issue").map((r) => r.id) } }, select: { id: true, projectId: true } }),
      prisma.sprint.findMany({ where: { id: { in: found.filter((r) => r.kind === "sprint").map((r) => r.id) } }, select: { id: true, projectId: true } }),
    ]);
    const projectOf = (kind: string, id: string): string | null =>
      kind === "project" ? id : kind === "issue" ? issues.find((i) => i.id === id)?.projectId ?? null : kind === "sprint" ? sprints.find((s) => s.id === id)?.projectId ?? null : null;

    if (replyToId) {
      const original = await prisma.chatMessage.findUnique({ where: { id: replyToId }, select: { id: true } });
      if (!original) return NextResponse.json({ error: "El mensaje al que respondés ya no existe" }, { status: 400 });
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          body,
          authorId: auth.user.id,
          replyToId,
          refs: { create: found.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id, projectId: projectOf(r.kind, r.id) })) },
        },
      });
      if (fileIds.length) {
        // Solo archivos que subió esta persona y que todavía no están en ningún mensaje.
        await tx.chatFile.updateMany({ where: { id: { in: fileIds }, uploadedById: auth.user.id, messageId: null }, data: { messageId: created.id } });
      }
      return tx.chatMessage.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude });
    });

    const [dto] = await toDTOs([message]);

    // Aviso del navegador a las personas mencionadas.
    const mentioned = found.filter((r) => r.kind === "user" && r.id !== auth.user.id).map((r) => r.id);
    if (mentioned.length) {
      const text = plainText(body, (r) => resolved.get(`${r.kind.toUpperCase()}:${r.id}`)?.label ?? "");
      void sendPush(mentioned, { title: `${auth.user.name} te mencionó en el chat`, body: text.slice(0, 160) || "Archivo adjunto", url: "/chat", tag: "chat" });
    }

    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
