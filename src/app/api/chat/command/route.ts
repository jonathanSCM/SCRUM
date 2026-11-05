import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { membersOf } from "@/lib/workspace";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { parseCommand, matchNames } from "@/lib/scrum/chatCommands";
import { sendPush } from "@/lib/push";
import { sendToSlackWebhook } from "@/lib/slack";
import { ensureChannels } from "@/lib/chatChannels";
import { teamSlackWebhookFor } from "@/lib/teamIntegrations";

// Ejecuta un comando del chat (/noti …, /reunion …) en el equipo activo. No guarda nada en el chat:
// responde con un resumen de a quién se avisó.
//   persona y /ayuda: cualquier miembro · slack / general / reunion: solo dueño o admin (evita spam al equipo)
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ body: z.string().trim().min(1).max(4000) }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  const cmd = parseCommand(parsed.data.body);
  if (!cmd.ok) return NextResponse.json({ error: cmd.error }, { status: 400 });
  const c = cmd.command;
  if (c.kind !== "persona" && !(c.kind === "general" && c.level === "ayuda") && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo un líder puede avisar a todo el equipo o al canal de Slack" }, { status: 403 });

  try {
    const workspaceId = auth.user.workspaceId!;
    const me = auth.user;
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const webhook = await teamSlackWebhookFor(workspaceId);
    const members = await membersOf(workspaceId);
    const slackIds = async (ids: string[]) => (await prisma.user.findMany({ where: { id: { in: ids } }, select: { slackUserId: true } })).map((u) => u.slackUserId).filter((x): x is string => !!x);

    const level = c.level;
    const tag = level === "urgente" ? "URGENTE" : level === "ayuda" ? "AYUDA" : "";
    const withTag = (t: string) => (tag ? `${tag} · ${t}` : t);
    // Urgente avisa a todo el canal de Slack con @channel.
    const slackText = (t: string) => (level === "urgente" ? `<!channel> ${t}` : t);
    let chatText: string | null = null;
    let title = "";
    let text = "";
    let targets: string[] | null = [];
    let toSlack = false;
    let label = "";

    if (c.kind === "persona") {
      const { found, missing, ambiguous } = matchNames(c.names, members.map(({ id, name }) => ({ id, name })));
      if (missing.length || ambiguous.length) {
        const parts = [missing.length ? `No encontré a: ${missing.join(", ")}` : "", ambiguous.length ? `Hay varias personas que coinciden con: ${ambiguous.join(", ")} (escribe el nombre completo)` : ""].filter(Boolean);
        return NextResponse.json({ error: parts.join(". ") }, { status: 400 });
      }
      title = withTag(`${me.name} te avisa`);
      text = c.message;
      targets = found.map((f) => f.id).filter((id) => id !== me.id);
      label = found.map((f) => f.name).join(", ");
      toSlack = !!webhook && found.length > 0;
      if (toSlack) {
        const mentions = (await slackIds(found.map((f) => f.id))).map((id) => `<@${id}>`).join(" ");
        await sendToSlackWebhook(webhook!, { title: withTag(`${me.name} avisa a ${label}`), description: `${c.message}${mentions ? `\n${mentions}` : ""}` });
      }
    } else {
      targets = members.map((m) => m.id).filter((id) => id !== me.id);
      if (c.kind === "slack") {
        if (!webhook) return NextResponse.json({ error: "El equipo no tiene canal de Slack: pega el webhook en Integraciones" }, { status: 400 });
        await sendToSlackWebhook(webhook, { title: withTag(`${me.name} (${ws?.name ?? "equipo"})`), description: slackText(c.message) });
        return NextResponse.json({ ok: true, summary: "Mensaje enviado al canal de Slack del equipo" });
      }
      if (c.kind === "general") {
        title = withTag(`${ws?.name ?? "Equipo"}: aviso de ${me.name}`);
        text = c.message;
        chatText = c.message;
      } else {
        title = withTag(`Reunión · ${c.when}`);
        text = `${c.topic} (convoca ${me.name})`;
        chatText = `Reunión · ${c.when}: ${c.topic}`;
      }
      label = "todo el equipo";
      toSlack = !!webhook;
      if (webhook) await sendToSlackWebhook(webhook, { title, description: slackText(text) });
    }

    // Avisos al equipo: quedan también en el chat, resaltados según el nivel.
    // /reunion va al canal "Reuniones"; el resto de avisos al canal "General".
    if (chatText) {
      const channels = await ensureChannels(workspaceId);
      const channelId = channels.find((ch) => ch.kind === (c.kind === "reunion" ? "REUNIONES" : "GENERAL"))?.id;
      await prisma.chatMessage.create({ data: { body: chatText, workspaceId, authorId: me.id, channelId, announce: true, level: level === "normal" ? null : level.toUpperCase() } });
    }
    const pushed = await sendPush(targets, { title, body: text.slice(0, 160), url: "/chat", tag: "aviso" });
    return NextResponse.json({ ok: true, summary: `Aviso a ${label}${pushed ? ` · ${pushed} dispositivo(s) con push` : ""}${toSlack ? " · enviado a Slack" : ""}` });
  } catch (e) {
    return errorResponse(e);
  }
}
