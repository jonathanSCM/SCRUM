import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { membersOf } from "@/lib/workspace";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { parseCommand, matchNames, maskRefs, type ChatCommand } from "@/lib/scrum/chatCommands";
import { plainText } from "@/lib/scrum/chat";
import { refRowsFor } from "@/lib/chatData";
import { notifyUsers } from "@/lib/notifications";
import type { NoticeKind } from "@/lib/scrum/notifPolicy";
import { sendToSlackWebhook } from "@/lib/slack";
import { ensureChannels } from "@/lib/chatChannels";
import { teamSlackWebhookFor } from "@/lib/teamIntegrations";

// Ejecuta un comando del chat (/noti …, /reunion …) en el equipo activo. No guarda nada en el chat:
// responde con un resumen de a quién se avisó.
//   persona y /ayuda: cualquier miembro · slack / general / reunion: solo dueño o admin (evita spam al equipo)
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  // Dos formas de pedirlo: el comando escrito ("body") o el botón "Avisar" ("notice", ya estructurado).
  const level = z.enum(["normal", "urgente", "ayuda"]).default("normal");
  const parsed = parseBody(
    z.union([
      z.object({ body: z.string().trim().min(1).max(4000) }),
      z.object({
        notice: z.discriminatedUnion("to", [
          z.object({ to: z.literal("general"), level, message: z.string().trim().min(1, "Escribe el mensaje").max(1000) }),
          z.object({ to: z.literal("personas"), level, message: z.string().trim().min(1, "Escribe el mensaje").max(1000), userIds: z.array(z.string().min(1).max(40)).min(1, "Elige a quién avisar").max(20) }),
          z.object({ to: z.literal("reunion"), level, when: z.string().trim().min(1, "Falta cuándo").max(80), topic: z.string().trim().min(1, "Falta el tema").max(500) }),
        ]),
      }),
    ]),
    await readJson(req)
  );
  if ("error" in parsed) return parsed.error;
  let c: ChatCommand;
  if ("notice" in parsed.data) {
    const n = parsed.data.notice;
    const lv = n.level ?? "normal";
    c = n.to === "general" ? { kind: "general", message: n.message, level: lv } : n.to === "personas" ? { kind: "persona", names: [], userIds: n.userIds, message: n.message, level: lv } : { kind: "reunion", when: n.when, topic: n.topic, level: lv };
  } else {
    // Las menciones [[tipo:id]] se apartan para interpretar el comando y se devuelven al mensaje y al tema.
    const { masked, unmask } = maskRefs(parsed.data.body);
    const cmd = parseCommand(masked);
    if (!cmd.ok) return NextResponse.json({ error: cmd.error }, { status: 400 });
    c = cmd.command;
    if (c.kind === "general" || c.kind === "slack" || c.kind === "persona") c.message = unmask(c.message);
    if (c.kind === "reunion") c.topic = unmask(c.topic);
  }
  if (c.kind !== "persona" && !(c.kind === "general" && c.level === "ayuda") && auth.user.role !== "LEAD") return NextResponse.json({ error: "Solo un líder puede avisar a todo el equipo o al canal de Slack" }, { status: 403 });

  try {
    const workspaceId = auth.user.workspaceId!;
    const me = auth.user;
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const webhook = await teamSlackWebhookFor(workspaceId);
    const members = await membersOf(workspaceId);
    const slackIds = async (ids: string[]) => (await prisma.user.findMany({ where: { id: { in: ids } }, select: { slackUserId: true } })).map((u) => u.slackUserId).filter((x): x is string => !!x);

    // Texto con menciones → texto plano (con el nombre de cada tarjeta, proyecto…) para avisos, Slack y teléfono.
    const refInfo = await refRowsFor(c.kind === "reunion" ? c.topic : c.message, workspaceId);
    const plain = (t: string) => plainText(t, (r) => refInfo.resolved.get(`${r.kind.toUpperCase()}:${r.id}`)?.label ?? "");
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
      const all = members.map(({ id, name }) => ({ id, name }));
      // Desde el botón llegan los ids de las personas elegidas; desde el comando, los nombres escritos.
      const { found, missing, ambiguous } = c.userIds ? { found: all.filter((m) => c.userIds!.includes(m.id)), missing: [] as string[], ambiguous: [] as string[] } : matchNames(c.names, all);
      if (c.userIds && found.length === 0) return NextResponse.json({ error: "Elige a quién avisar" }, { status: 400 });
      if (missing.length || ambiguous.length) {
        const parts = [missing.length ? `No encontré a: ${missing.join(", ")}` : "", ambiguous.length ? `Hay varias personas que coinciden con: ${ambiguous.join(", ")} (escribe el nombre completo)` : ""].filter(Boolean);
        return NextResponse.json({ error: parts.join(". ") }, { status: 400 });
      }
      title = withTag(`${me.name} te avisa`);
      text = plain(c.message);
      targets = found.map((f) => f.id).filter((id) => id !== me.id);
      label = found.map((f) => f.name).join(", ");
      toSlack = !!webhook && found.length > 0;
      if (toSlack) {
        const mentions = (await slackIds(found.map((f) => f.id))).map((id) => `<@${id}>`).join(" ");
        await sendToSlackWebhook(webhook!, { title: withTag(`${me.name} avisa a ${label}`), description: `${plain(c.message)}${mentions ? `\n${mentions}` : ""}` });
      }
    } else {
      targets = members.map((m) => m.id).filter((id) => id !== me.id);
      if (c.kind === "slack") {
        if (!webhook) return NextResponse.json({ error: "El equipo no tiene canal de Slack: pega el webhook en Integraciones" }, { status: 400 });
        await sendToSlackWebhook(webhook, { title: withTag(`${me.name} (${ws?.name ?? "equipo"})`), description: slackText(plain(c.message)) });
        return NextResponse.json({ ok: true, summary: "Mensaje enviado al canal de Slack del equipo" });
      }
      if (c.kind === "general") {
        title = withTag(`${ws?.name ?? "Equipo"}: aviso de ${me.name}`);
        text = plain(c.message);
        chatText = c.message;
      } else {
        title = withTag(`Reunión · ${c.when}`);
        text = `${plain(c.topic)} (convoca ${me.name})`;
        chatText = `Reunión · ${c.when}: ${c.topic}`;
      }
      label = "todo el equipo";
      toSlack = !!webhook;
      if (webhook) await sendToSlackWebhook(webhook, { title, description: slackText(text) });
    }

    // Avisos al equipo: quedan también en el chat, resaltados según el nivel.
    // /reunion va al canal "Reuniones"; el resto de avisos al canal "General".
    let chatUrl = "/chat";
    if (chatText) {
      const channels = await ensureChannels(workspaceId);
      const channelId = channels.find((ch) => ch.kind === (c.kind === "reunion" ? "REUNIONES" : "GENERAL"))?.id;
      if (c.kind === "reunion" && channelId) chatUrl = `/chat?canal=${channelId}`;
      await prisma.chatMessage.create({ data: { body: chatText, workspaceId, authorId: me.id, channelId, announce: true, level: level === "normal" ? null : level.toUpperCase(), refs: { create: refInfo.rows } } });
    }
    // Todos estos avisos son instantáneos (no esperan el resumen): persona, general, urgente, ayuda y reunión.
    const noticeKind: NoticeKind = level === "urgente" ? "URGENT" : level === "ayuda" ? "HELP" : c.kind === "persona" ? "DIRECT" : c.kind === "reunion" ? "REUNION" : "ANNOUNCE";
    const priority = level === "urgente" ? "urgent" : level === "ayuda" || c.kind === "reunion" ? "high" : "default";
    const notified = await notifyUsers(targets, { kind: noticeKind, title, body: text.slice(0, 160), url: chatUrl, priority, workspaceId });
    return NextResponse.json({ ok: true, summary: `Aviso a ${label}${notified ? ` · ${notified} ${notified === 1 ? "persona" : "personas"} (bandeja, navegador y teléfono)` : ""}${toSlack ? " · enviado a Slack" : ""}` });
  } catch (e) {
    return errorResponse(e);
  }
}
