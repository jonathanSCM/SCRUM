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
import { createMeeting, inviteesOf, whenLabel, zonesOf } from "@/lib/meetings";
import { parseWhen } from "@/lib/scrum/meetingWhen";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/scrum/countries";
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
      z.object({ body: z.string().trim().min(1).max(4000), channelId: z.string().min(1).max(40).optional(), tz: z.string().max(60).optional() }),
      z.object({
        channelId: z.string().min(1).max(40).optional(),
        tz: z.string().max(60).optional(),
        notice: z.discriminatedUnion("to", [
          z.object({ to: z.literal("general"), level, message: z.string().trim().min(1, "Escribe el mensaje").max(1000) }),
          z.object({ to: z.literal("personas"), level, message: z.string().trim().min(1, "Escribe el mensaje").max(1000), userIds: z.array(z.string().min(1).max(40)).min(1, "Elige a quién avisar").max(20) }),
          z.object({
            to: z.literal("reunion"),
            level,
            topic: z.string().trim().min(1, "Falta el tema").max(500),
            // Fecha exacta (desde el calendario del botón) o escrita a mano ("mañana 10:30").
            startsAt: z.string().datetime().optional(),
            when: z.string().trim().max(80).optional(),
            durationMin: z.number().int().min(5).max(720).optional(),
            meetUrl: z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\//i.test(v), "El enlace debe empezar con https://").optional(),
          }),
        ]),
      }),
    ]),
    await readJson(req)
  );
  if ("error" in parsed) return parsed.error;
  let c: ChatCommand;
  // Reunión pedida con fecha exacta desde el botón (calendario).
  let exact: { startsAt: Date | null; durationMin?: number; meetUrl: string | null } | null = null;
  if ("notice" in parsed.data) {
    const n = parsed.data.notice;
    const lv = n.level ?? "normal";
    c = n.to === "general" ? { kind: "general", message: n.message, level: lv } : n.to === "personas" ? { kind: "persona", names: [], userIds: n.userIds, message: n.message, level: lv } : { kind: "reunion", when: n.when ?? "", topic: n.topic, level: lv };
    if (n.to === "reunion") {
      if (!n.startsAt && !n.when?.trim()) return NextResponse.json({ error: "Falta cuándo" }, { status: 400 });
      exact = { startsAt: n.startsAt ? new Date(n.startsAt) : null, durationMin: n.durationMin, meetUrl: n.meetUrl || null };
    }
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
    const refInfo = await refRowsFor(c.kind === "reunion" ? c.topic : c.message, workspaceId, auth.user.id); // reunión: se usa para el tema
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

    // Reunión: se registra en el calendario (con la hora de quien la agenda, convertida a UTC) y se anuncia en el chat.
    if (c.kind === "reunion") {
      // La hora se interpreta en la zona de quien escribe: la de su perfil, o la de su navegador si no eligió país.
      const profileZone = (await prisma.user.findUnique({ where: { id: me.id }, select: { timezone: true } }))?.timezone;
      const sent = parsed.data.tz && isValidTimeZone(parsed.data.tz) ? parsed.data.tz : null;
      const myZone = profileZone && isValidTimeZone(profileZone) ? profileZone : sent ?? (await zonesOf([me.id])).get(me.id) ?? DEFAULT_TZ;
      const startsAt = exact?.startsAt ?? parseWhen(c.when, myZone);
      if (startsAt) {
        const meeting = await createMeeting({
          workspaceId,
          creator: { id: me.id, name: me.name },
          title: plain(c.topic), // sin las marcas [[…]] de las menciones: el calendario muestra los nombres
          startsAt,
          durationMin: exact?.durationMin ?? 60,
          meetUrl: exact?.meetUrl ?? null,
          post: { level: level === "normal" ? null : (level.toUpperCase() as "AYUDA" | "URGENTE"), channelId: parsed.data.channelId ?? null },
        });
        const inv = (await inviteesOf(meeting)).filter((u) => u !== me.id);
        if (webhook) await sendToSlackWebhook(webhook, { title: withTag(`Reunión · ${whenLabel(startsAt, myZone)}`), description: slackText(`${c.topic} (convoca ${me.name})`) });
        return NextResponse.json({ ok: true, meetingId: meeting.id, summary: `Reunión agendada en el calendario: ${whenLabel(startsAt, myZone)} · avisé a ${inv.length} ${inv.length === 1 ? "persona" : "personas"}${webhook ? " · enviado a Slack" : ""}` });
      }
      // No se entendió la fecha: no se manda nada a medias (un aviso sin reunión en el calendario confunde a todos).
      return NextResponse.json({ error: `No entendí la fecha «${c.when}». Escribe, por ejemplo: /reunion mañana 10:30: revisión del sprint · /reunion viernes 3pm: retro · /reunion 20/11 9:00: planificación. O usa el botón Avisar → Reunión.` }, { status: 400 });
    }

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
      // (Las reuniones salen antes, por createMeeting: acá solo llegan los avisos generales.)
      title = withTag(`${ws?.name ?? "Equipo"}: aviso de ${me.name}`);
      text = plain(c.message);
      chatText = c.message;
      label = "todo el equipo";
      toSlack = !!webhook;
      if (webhook) await sendToSlackWebhook(webhook, { title, description: slackText(text) });
    }

    // Avisos al equipo: quedan también en el chat, resaltados según el nivel.
    // Se publican en el canal desde el que se enviaron (si es uno abierto al equipo: General, un canal del equipo o de un proyecto),
    // para que no "desaparezcan" de donde se escribieron. /reunion va a "Reuniones" salvo que se envíe desde ahí.
    // Como el aviso le llega a TODO el equipo, nunca se publica en un canal privado ni en un mensaje directo: va a "General".
    let chatUrl = "/chat";
    let postedIn = "";
    if (chatText) {
      const channels = await ensureChannels(workspaceId, me.id);
      const fallback = channels.find((ch) => ch.kind === "GENERAL");
      const asked = parsed.data.channelId ? channels.find((ch) => ch.id === parsed.data.channelId) : undefined;
      const open = asked && ["GENERAL", "CUSTOM", "PROJECT", "REUNIONES"].includes(asked.kind) ? asked : undefined;
      const target = open ?? fallback;
      const channelId = target?.id;
      postedIn = target?.name ?? "";
      if (channelId) chatUrl = `/chat?canal=${channelId}`;
      await prisma.chatMessage.create({ data: { body: chatText, workspaceId, authorId: me.id, channelId, announce: true, level: level === "normal" ? null : level.toUpperCase(), refs: { create: refInfo.rows } } });
    }
    // Todos estos avisos son instantáneos (no esperan el resumen): persona, general, urgente, ayuda y reunión.
    const noticeKind: NoticeKind = level === "urgente" ? "URGENT" : level === "ayuda" ? "HELP" : c.kind === "persona" ? "DIRECT" : "ANNOUNCE";
    const priority = level === "urgente" ? "urgent" : level === "ayuda" ? "high" : "default";
    const notified = await notifyUsers(targets, { kind: noticeKind, title, body: text.slice(0, 160), url: chatUrl, priority, workspaceId });
    return NextResponse.json({ ok: true, summary: `Aviso a ${label}${notified ? ` · ${notified} ${notified === 1 ? "persona" : "personas"} (bandeja, navegador y teléfono)` : ""}${toSlack ? " · enviado a Slack" : ""}${postedIn ? ` · publicado en ${postedIn}` : ""}` });
  } catch (e) {
    return errorResponse(e);
  }
}
