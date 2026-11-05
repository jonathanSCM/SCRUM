import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { chatMessageSchema, parseBody, readJson } from "@/lib/validation";
import { loadMessages, messageInclude, resolveRefs, toDTOs } from "@/lib/chatData";
import { findKeyMentions, makeToken, parseRefs, plainText } from "@/lib/scrum/chat";
import { sendPush } from "@/lib/push";
import { channelFilter, ensureChannels } from "@/lib/chatChannels";

// ?after=<ISO> devuelve solo los nuevos; ?project=<id> solo los que mencionan ese proyecto.
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  try {
    const valid = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;
    const workspaceId = auth.user.workspaceId!;
    // Si piden un proyecto, tiene que ser de este equipo.
    const projectParam = url.searchParams.get("project");
    if (projectParam && !(await prisma.project.findFirst({ where: { id: projectParam, workspaceId }, select: { id: true } }))) return NextResponse.json({ messages: [], deleted: [] });
    // ?channel=<id> un canal · ?announce=1 solo avisos por comando (pestaña "Del equipo" de un proyecto)
    const channelParam = url.searchParams.get("channel");
    const channel = channelParam ? await channelFilter(workspaceId, channelParam) : null;
    if (channelParam && !channel) return NextResponse.json({ messages: [], deleted: [] });
    const messages = await loadMessages({ workspaceId, after: valid, projectId: projectParam, channel, announce: url.searchParams.get("announce") === "1" });
    // Mensajes borrados desde ese momento (con margen por si los relojes no coinciden al milisegundo).
    const deleted = valid
      ? (await prisma.chatDeletion.findMany({ where: { workspaceId, deletedAt: { gt: new Date(valid.getTime() - 10_000) } }, select: { messageId: true } })).map((d) => d.messageId)
      : [];
    return NextResponse.json({ messages, deleted });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(chatMessageSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { fileIds = [], replyToId = null } = parsed.data;
  let body = parsed.data.body;
  if (!body && fileIds.length === 0) return NextResponse.json({ error: "Escribí un mensaje o adjuntá un archivo" }, { status: 400 });

  try {
    // Solo se conservan las referencias que existen; cada una guarda su proyecto para poder filtrar.
    const workspaceId = auth.user.workspaceId!;

    // "#SAI" o "#SAI-12" escritos a mano se convierten en mención del proyecto o ticket de ese código (si existe en el equipo).
    const keyed = findKeyMentions(body);
    if (keyed.length) {
      const projects = await prisma.project.findMany({ where: { workspaceId, key: { in: [...new Set(keyed.map((k) => k.key))] } }, select: { id: true, key: true } });
      const byKey = new Map(projects.map((p) => [p.key!.toUpperCase(), p.id]));
      const wantedIssues = keyed.filter((k) => k.number !== null && byKey.has(k.key));
      const issues = wantedIssues.length
        ? await prisma.task.findMany({ where: { OR: wantedIssues.map((k) => ({ projectId: byKey.get(k.key)!, number: k.number! })) }, select: { id: true, number: true, projectId: true } })
        : [];
      for (const k of [...keyed].reverse()) {
        const projectId = byKey.get(k.key);
        if (!projectId) continue;
        const token = k.number === null ? makeToken("project", projectId) : (() => { const t = issues.find((i) => i.projectId === projectId && i.number === k.number); return t ? makeToken("issue", t.id) : null; })();
        if (token) body = body.slice(0, k.start) + token + body.slice(k.end);
      }
    }

    const wanted = parseRefs(body);
    const resolved = await resolveRefs(wanted.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id })), workspaceId);
    const found = wanted.filter((r) => resolved.has(`${r.kind.toUpperCase()}:${r.id}`));

    const [issues, sprints] = await Promise.all([
      prisma.task.findMany({ where: { id: { in: found.filter((r) => r.kind === "issue").map((r) => r.id) }, project: { workspaceId } }, select: { id: true, projectId: true } }),
      prisma.sprint.findMany({ where: { id: { in: found.filter((r) => r.kind === "sprint").map((r) => r.id) }, project: { workspaceId } }, select: { id: true, projectId: true } }),
    ]);
    const projectOf = (kind: string, id: string): string | null =>
      kind === "project" ? id : kind === "issue" ? issues.find((i) => i.id === id)?.projectId ?? null : kind === "sprint" ? sprints.find((s) => s.id === id)?.projectId ?? null : null;

    // Canal de destino: el pedido (del equipo) o "General".
    const channels = await ensureChannels(workspaceId);
    const channelId = parsed.data.channelId ? channels.find((c) => c.id === parsed.data.channelId)?.id : channels.find((c) => c.kind === "GENERAL")?.id;
    if (!channelId) return NextResponse.json({ error: "Ese canal no existe" }, { status: 400 });

    if (replyToId) {
      const original = await prisma.chatMessage.findFirst({ where: { id: replyToId, workspaceId }, select: { id: true } });
      if (!original) return NextResponse.json({ error: "El mensaje al que respondés ya no existe" }, { status: 400 });
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          body,
          workspaceId,
          channelId,
          authorId: auth.user.id,
          replyToId,
          refs: { create: found.map((r) => ({ kind: r.kind.toUpperCase(), targetId: r.id, projectId: projectOf(r.kind, r.id) })) },
        },
      });
      if (fileIds.length) {
        // Solo archivos que subió esta persona y que todavía no están en ningún mensaje.
        await tx.chatFile.updateMany({ where: { id: { in: fileIds }, uploadedById: auth.user.id, workspaceId, messageId: null }, data: { messageId: created.id } });
      }
      return tx.chatMessage.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude });
    });

    const [dto] = await toDTOs([message], workspaceId);

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
