// Prueba de aislamiento entre equipos contra un servidor REAL.
//
//   DATABASE_URL=… npx tsx scripts/isolation-test.mjs   (con `next dev -p 3056` o `next start` corriendo con la misma base)
//   BASE_URL=http://localhost:3056
//
// Crea dos equipos (A y B) con personas, proyectos, tickets, notas, chat, etc., y comprueba que
// ninguna persona ni token de un equipo puede ver, leer o modificar nada del otro, y que los roles
// valen solo dentro de cada equipo. Sale con código 1 si algo falla.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

// Mismo formato que src/lib/apiToken.ts (ese archivo es "server-only" y no se puede importar acá).
const generateToken = () => `scrum_${randomBytes(24).toString("hex")}`;
const hashToken = (t) => createHash("sha256").update(t).digest("hex");

const BASE = process.env.BASE_URL ?? "http://localhost:3056";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const PASSWORD = "password-de-prueba-123";

let failures = 0;
let checks = 0;
function check(name, ok, detail = "") {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FALLA  ${name}${detail ? "  -> " + detail : ""}`);
  }
}

// ---- Cliente HTTP con cookies ----
class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.bearer = null;
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async login(email) {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    this.store(csrfRes);
    const { csrfToken } = await csrfRes.json();
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: this.header() },
      body: new URLSearchParams({ csrfToken, email, password: PASSWORD, json: "true" }),
    });
    this.store(res);
    return this;
  }
  async req(method, path, body) {
    const headers = { Cookie: this.header() };
    if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    let json = null;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }
}

async function mkUser(name, email) {
  return prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
}

async function mkWorkspace(tag) {
  const ws = await prisma.workspace.create({ data: { name: `Equipo ${tag}`, slug: `eq-${tag.toLowerCase()}-${stamp}` } });
  const status = await prisma.statusOption.create({ data: { name: "Pendiente", color: "#888888", order: 0, workspaceId: ws.id } });
  const project = await prisma.project.create({ data: { name: `Proyecto ${tag}`, key: "SAI", statusId: status.id, workspaceId: ws.id } });
  const sprint = await prisma.sprint.create({ data: { name: `Sprint ${tag}`, projectId: project.id } });
  const task = await prisma.task.create({ data: { title: `Ticket ${tag}`, number: 1, projectId: project.id, sprintId: sprint.id, reporterId: null } });
  await prisma.project.update({ where: { id: project.id }, data: { taskSeq: 1 } });
  const comment = await prisma.comment.create({ data: { body: `Comentario ${tag}`, taskId: task.id } });
  const attachment = await prisma.attachment.create({ data: { filename: "a.txt", mimeType: "text/plain", size: 1, data: new Uint8Array([65]), taskId: task.id, projectId: project.id } });
  const note = await prisma.note.create({ data: { title: `Nota ${tag}`, projectId: project.id } });
  const retro = await prisma.retroItem.create({ data: { column: "ACTION", body: `Acuerdo ${tag}`, projectId: project.id, sprintId: sprint.id } });
  const contact = await prisma.projectContact.create({ data: { name: `Contacto ${tag}`, projectId: project.id } });
  const pmsg = await prisma.projectMessage.create({ data: { body: `Msg ${tag}`, projectId: project.id } });
  const chat = await prisma.chatMessage.create({ data: { body: `Chat secreto ${tag}`, workspaceId: ws.id } });
  const chatFile = await prisma.chatFile.create({ data: { filename: "f.txt", mimeType: "text/plain", size: 1, data: new Uint8Array([66]), workspaceId: ws.id } });
  return { ws, status, project, sprint, task, comment, attachment, note, retro, contact, pmsg, chat, chatFile };
}

const member = (userId, workspaceId, role) => prisma.membership.create({ data: { userId, workspaceId, role } });

async function main() {
  console.log(`Prueba de aislamiento contra ${BASE}`);
  const A = await mkWorkspace("A");
  const B = await mkWorkspace("B");

  const aOwner = await mkUser("Ana Dueña A", `ana-${stamp}@a.test`);
  const aMember = await mkUser("Aldo Miembro A", `aldo-${stamp}@a.test`);
  const bOwner = await mkUser("Beto Dueño B", `beto-${stamp}@b.test`);
  const multi = await mkUser("Marta Multi", `marta-${stamp}@m.test`); // ADMIN en A, MEMBER en B
  await member(aOwner.id, A.ws.id, "OWNER");
  await member(aMember.id, A.ws.id, "MEMBER");
  await member(bOwner.id, B.ws.id, "OWNER");
  await member(multi.id, A.ws.id, "ADMIN");
  await member(multi.id, B.ws.id, "MEMBER");

  const cAOwner = await new Client("Ana (dueña A)").login(aOwner.email);
  const cAMember = await new Client("Aldo (miembro A)").login(aMember.email);
  const cBOwner = await new Client("Beto (dueño B)").login(bOwner.email);
  const cMulti = await new Client("Marta (A admin, B miembro)").login(multi.email);
  for (const c of [cAOwner, cAMember, cBOwner, cMulti]) check(`login ${c.label}`, c.cookies.size > 0);

  // ---------- 1) Una persona de B no puede tocar NADA de A (404, no 403) ----------
  console.log("1) Recursos de A pedidos por alguien de B");
  const j = { title: "x", body: "x" };
  const cross = [
    ["PATCH", `/api/projects/${A.project.id}`, { description: "hack" }],
    ["DELETE", `/api/projects/${A.project.id}`],
    ["POST", `/api/projects/${A.project.id}/issues`, { title: "intruso" }],
    ["POST", `/api/projects/${A.project.id}/bulk`, { ids: [A.task.id], patch: { priority: "ALTA" } }],
    ["POST", `/api/projects/${A.project.id}/move`, { issueId: A.task.id }],
    ["POST", `/api/projects/${A.project.id}/sprints`, { name: "x" }],
    ["POST", `/api/projects/${A.project.id}/notes`, j],
    ["POST", `/api/projects/${A.project.id}/retro`, { sprintId: A.sprint.id, column: "ACTION", body: "x" }],
    ["POST", `/api/projects/${A.project.id}/contacts`, { name: "x" }],
    ["GET", `/api/projects/${A.project.id}/standup?date=2026-01-01`],
    ["POST", `/api/projects/${A.project.id}/standup`, { date: "2026-01-01", today: "x" }],
    ["GET", `/api/projects/${A.project.id}/export`],
    ["PATCH", `/api/projects/${A.project.id}/slack`, { slackChannelId: "C0123456789" }],
    ["PATCH", `/api/projects/${A.project.id}/telegram`, { botToken: "", chatId: "" }],
    ["PATCH", `/api/issues/${A.task.id}`, { title: "hack" }],
    ["DELETE", `/api/issues/${A.task.id}`],
    ["POST", `/api/issues/${A.task.id}/comments`, { body: "x" }],
    ["PATCH", `/api/comments/${A.comment.id}`, { body: "x" }],
    ["DELETE", `/api/comments/${A.comment.id}`],
    ["GET", `/api/attachments/${A.attachment.id}`],
    ["DELETE", `/api/attachments/${A.attachment.id}`],
    ["PATCH", `/api/sprints/${A.sprint.id}`, { name: "x" }],
    ["DELETE", `/api/sprints/${A.sprint.id}`],
    ["POST", `/api/sprints/${A.sprint.id}/start`, { startDate: "2026-01-01", endDate: "2026-01-14" }],
    ["POST", `/api/sprints/${A.sprint.id}/complete`, { destination: "BACKLOG" }],
    ["GET", `/api/sprints/${A.sprint.id}/report`],
    ["PATCH", `/api/notes/${A.note.id}`, { title: "x" }],
    ["DELETE", `/api/notes/${A.note.id}`],
    ["POST", `/api/notes/${A.note.id}/tickets`, { items: ["x"] }],
    ["DELETE", `/api/retro/${A.retro.id}`],
    ["POST", `/api/retro/${A.retro.id}/ticket`],
    ["PATCH", `/api/contacts/${A.contact.id}`, { name: "x" }],
    ["DELETE", `/api/contacts/${A.contact.id}`],
    ["DELETE", `/api/messages/${A.pmsg.id}`],
    ["PATCH", `/api/statuses/${A.status.id}`, { name: "x", color: "#123456" }],
    ["DELETE", `/api/statuses/${A.status.id}`],
    ["DELETE", `/api/chat/messages/${A.chat.id}`],
    ["POST", `/api/chat/messages/${A.chat.id}/reactions`, { emoji: "👍" }],
    ["GET", `/api/chat/files/${A.chatFile.id}`],
    ["GET", `/api/ai/projects/${A.project.id}`],
    ["DELETE", `/api/users/${aMember.id}`],
  ];
  for (const [m, p, b] of cross) {
    const r = await cBOwner.req(m, p, b);
    check(`B -> ${m} ${p.replace(/c[a-z0-9]{20,}/g, ":id")} debe ser 404`, r.status === 404, `dio ${r.status}`);
  }
  const tA = await prisma.task.findUnique({ where: { id: A.task.id } });
  check("el ticket de A no cambió", tA?.title === "Ticket A");
  check("el proyecto de A sigue existiendo", !!(await prisma.project.findUnique({ where: { id: A.project.id } })));

  // ---------- 2) Listados: cada equipo ve solo lo suyo ----------
  console.log("2) Listados");
  const s = await cBOwner.req("GET", "/api/search");
  check("búsqueda de B no incluye proyectos de A", s.status === 200 && !JSON.stringify(s.json).includes("Proyecto A") && JSON.stringify(s.json).includes("Proyecto B"));
  const tm = await cBOwner.req("GET", "/api/team-members");
  check("personas de B: solo Beto y Marta", tm.status === 200 && tm.json.length === 2 && !JSON.stringify(tm.json).includes("Ana") && !JSON.stringify(tm.json).includes("Aldo"));
  const cm = await cBOwner.req("GET", "/api/chat/messages");
  check("chat de B no incluye mensajes de A", cm.status === 200 && JSON.stringify(cm.json).includes("Chat secreto B") && !JSON.stringify(cm.json).includes("Chat secreto A"));
  const ci = await cBOwner.req("GET", "/api/chat/index");
  check("índice del chat de B sin datos de A", ci.status === 200 && !JSON.stringify(ci.json).includes("Proyecto A") && !JSON.stringify(ci.json).includes("Ana"));
  const us = await cBOwner.req("GET", "/api/users");
  check("lista de personas de B sin gente de A", us.status === 200 && !JSON.stringify(us.json).includes("Ana"));
  const bk = await cBOwner.req("GET", "/api/issues/by-key/SAI-1");
  check("la clave SAI-1 en B devuelve el ticket de B, no el de A", bk.status === 200 && bk.json?.issue?.title === "Ticket B");
  const people = await cBOwner.req("GET", `/api/users/${aOwner.id}/image/avatar`);
  check("la foto de alguien sin equipo en común da 404", people.status === 404);

  // ---------- 3) Asignar, mencionar y referenciar fuera del equipo ----------
  console.log("3) Referencias cruzadas");
  const asg = await cBOwner.req("PATCH", `/api/issues/${B.task.id}`, { assigneeUserId: aOwner.id });
  check("no se puede asignar un ticket de B a alguien de A", asg.status === 400, `dio ${asg.status}`);
  const okAsg = await cBOwner.req("PATCH", `/api/issues/${B.task.id}`, { assigneeUserId: multi.id });
  check("sí se puede asignar a alguien que es de B (aunque también de A)", okAsg.status === 200, `dio ${okAsg.status}`);
  const ref = await cBOwner.req("POST", "/api/chat/messages", { body: `mirá [[project:${A.project.id}]] y [[user:${aOwner.id}]]` });
  check("un mensaje de B puede enviarse", ref.status === 201);
  check("las referencias a recursos de A se descartan", ref.status === 201 && ref.json.refs.every((r) => r.missing));
  const rows = await prisma.chatRef.findMany({ where: { messageId: ref.json?.id } });
  check("no se guardó ninguna referencia a A", rows.length === 0);
  const cProj = await cBOwner.req("GET", `/api/chat/messages?project=${A.project.id}`);
  check("pedir el chat de un proyecto de A desde B no devuelve nada", cProj.status === 200 && (cProj.json.messages?.length ?? 0) === 0);
  const lead = await cBOwner.req("PATCH", `/api/projects/${B.project.id}`, { leadUserId: aOwner.id });
  check("no se puede poner de encargado del proyecto a alguien de otro equipo", lead.status === 400, `dio ${lead.status}`);
  const st = await cBOwner.req("PATCH", `/api/projects/${B.project.id}`, { statusId: A.status.id });
  check("no se puede usar un estado de otro equipo", st.status === 400, `dio ${st.status}`);

  // ---------- 4) Roles: valen solo dentro de cada equipo ----------
  console.log("4) Roles por equipo (Marta: admin en A, miembro en B)");
  const inA = await cMulti.req("PATCH", `/api/projects/${A.project.id}/slack`, { slackChannelId: "C0123456789" });
  check("Marta es admin en A: puede configurar Slack", inA.status === 200, `dio ${inA.status}`);
  const inB = await cMulti.req("PATCH", `/api/projects/${B.project.id}/slack`, { slackChannelId: "C0123456789" });
  check("Marta es miembro en B: NO puede configurar Slack", inB.status === 403, `dio ${inB.status}`);
  const memberLead = await cAMember.req("PATCH", `/api/projects/${A.project.id}/slack`, { slackChannelId: "C0123456789" });
  check("un miembro de A no configura Slack", memberLead.status === 403, `dio ${memberLead.status}`);
  const delOwner = await cMulti.req("DELETE", `/api/users/${aOwner.id}`);
  check("un admin no puede sacar a un dueño", delOwner.status === 403, `dio ${delOwner.status}`);
  const soleOwner = await cAOwner.req("DELETE", `/api/users/${aOwner.id}`);
  check("no se puede sacar al único dueño", soleOwner.status === 400, `dio ${soleOwner.status}`);
  const mkAcct = await cMulti.req("POST", "/api/users", { name: "Nuevo", email: `nuevo-${stamp}@x.test`, password: "password-nueva-1", role: "MEMBER" });
  check("Marta (admin en A) crea cuentas en A", mkAcct.status === 201, `dio ${mkAcct.status}`);
  if (mkAcct.status === 201) {
    const m = await prisma.membership.findFirst({ where: { userId: mkAcct.json.id } });
    check("la cuenta nueva quedó como miembro de A (no de B)", m?.workspaceId === A.ws.id && m?.role === "MEMBER");
  }

  // Marta cambia al equipo B (cookie `ws`): los listados son de B y su rol es de B
  cMulti.cookies.set("ws", B.ws.id);
  const mTm = await cMulti.req("GET", "/api/team-members");
  check("con el equipo B activo, Marta ve solo personas de B", mTm.status === 200 && !JSON.stringify(mTm.json).includes("Ana") && JSON.stringify(mTm.json).includes("Beto"));
  const mCreate = await cMulti.req("POST", "/api/users", { name: "X", email: `x-${stamp}@x.test`, password: "password-nueva-1" });
  check("con B activo, Marta (miembro) no crea cuentas", mCreate.status === 403, `dio ${mCreate.status}`);
  cMulti.cookies.set("ws", A.ws.id);
  cMulti.cookies.delete("ws");

  // ---------- 5) Tokens IA: solo en su equipo ----------
  console.log("5) Token IA");
  const rawToken = generateToken();
  await prisma.apiToken.create({ data: { userId: multi.id, tokenHash: hashToken(rawToken), prefix: rawToken.slice(0, 10), workspaceId: A.ws.id } });
  const tk = new Client("token de Marta en A");
  tk.bearer = rawToken;
  const t1 = await tk.req("GET", "/api/ai/projects");
  check("el token de A lista solo proyectos de A", t1.status === 200 && JSON.stringify(t1.json).includes("Proyecto A") && !JSON.stringify(t1.json).includes("Proyecto B"));
  const t2 = await tk.req("GET", `/api/ai/projects/${B.project.id}`);
  check("el token de A no abre proyectos de B (aunque Marta sea miembro de B)", t2.status === 404, `dio ${t2.status}`);
  const t3 = await tk.req("POST", `/api/projects/${B.project.id}/issues`, { title: "x" });
  check("el token de A no crea tickets en B", t3.status === 404, `dio ${t3.status}`);
  const t4 = await tk.req("POST", `/api/projects/${A.project.id}/issues`, { title: "vía token" });
  check("el token de A sí crea tickets en A", t4.status === 201, `dio ${t4.status}`);
  const t5 = await tk.req("DELETE", `/api/projects/${A.project.id}`);
  check("el token no puede borrar (403 del middleware)", t5.status === 403, `dio ${t5.status}`);
  const t6 = await tk.req("POST", "/api/ai/import", { project: { name: "Proyecto B" }, tasks: [{ title: "colada" }] });
  check("importar con el token de A y el nombre de un proyecto de B crea uno nuevo en A, no toca B", t6.status === 200 && t6.json?.project?.created === true);
  const bTasks = await prisma.task.count({ where: { projectId: B.project.id } });
  check("el proyecto de B no recibió tickets", bTasks === 1, `tiene ${bTasks}`);

  console.log("6) Fase 2: equipos, roles e invitaciones");
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const mkInvite = async (workspaceId, email, extra = {}) => {
    const token = `inv_${randomBytes(24).toString("hex")}`;
    const inv = await prisma.invitation.create({ data: { email, tokenHash: sha(token), workspaceId, role: "MEMBER", expiresAt: new Date(Date.now() + 86400000), ...extra } });
    return { token, inv };
  };
  // Cambiar de equipo activo
  const sw1 = await cAMember.req("POST", "/api/workspaces/active", { workspaceId: B.ws.id });
  check("cambiar a un equipo del que no soy miembro -> 404", sw1.status === 404, `dio ${sw1.status}`);
  const sw2 = await cMulti.req("POST", "/api/workspaces/active", { workspaceId: B.ws.id });
  check("cambiar a un equipo propio funciona", sw2.status === 200, `dio ${sw2.status}`);
  await cMulti.req("POST", "/api/workspaces/active", { workspaceId: A.ws.id });
  // Invitaciones: un líder de A no toca las de B
  const invB = await mkInvite(B.ws.id, `nuevo-${stamp}@b.test`);
  const i1 = await cAOwner.req("DELETE", `/api/workspaces/invitations/${invB.inv.id}`);
  check("revocar una invitación de otro equipo -> 404", i1.status === 404, `dio ${i1.status}`);
  const i2 = await cAOwner.req("POST", `/api/workspaces/invitations/${invB.inv.id}/resend`);
  check("reenviar una invitación de otro equipo -> 404", i2.status === 404, `dio ${i2.status}`);
  const i3 = await cAMember.req("POST", "/api/workspaces/invitations", { email: `x-${stamp}@z.test` });
  check("un miembro no puede invitar", i3.status === 403, `dio ${i3.status}`);
  const i4 = await cAOwner.req("GET", "/api/workspaces/invitations");
  check("la lista de invitaciones de A no incluye las de B", i4.status === 200 && !JSON.stringify(i4.json).includes(`nuevo-${stamp}@b.test`));
  const i5 = await cAOwner.req("POST", "/api/workspaces/invitations", { email: aMember.email });
  check("invitar a quien ya es del equipo -> 400", i5.status === 400, `dio ${i5.status}`);
  // Aceptar
  const anon = new Client("anónimo");
  const g1 = await anon.req("GET", `/api/invite/${invB.token}`);
  check("info pública de invitación válida", g1.status === 200 && g1.json?.state === "ok");
  const g2 = await anon.req("GET", `/api/invite/inv_noexiste`);
  check("token inexistente -> 404", g2.status === 404);
  const a1 = await cAOwner.req("POST", `/api/invite/${invB.token}/accept`, {});
  check("aceptar con la cuenta equivocada -> 403", a1.status === 403, `dio ${a1.status}`);
  const exp = await mkInvite(A.ws.id, `venc-${stamp}@a.test`, { expiresAt: new Date(Date.now() - 1000) });
  const a2 = await anon.req("POST", `/api/invite/${exp.token}/accept`, { name: "V", password: "12345678" });
  check("invitación vencida -> 410", a2.status === 410, `dio ${a2.status}`);
  const rev = await mkInvite(A.ws.id, `rev-${stamp}@a.test`, { revokedAt: new Date() });
  const a3 = await anon.req("POST", `/api/invite/${rev.token}/accept`, { name: "V", password: "12345678" });
  check("invitación revocada -> 410", a3.status === 410, `dio ${a3.status}`);
  const okInv = await mkInvite(A.ws.id, `nueva-${stamp}@a.test`);
  const a4 = await anon.req("POST", `/api/invite/${okInv.token}/accept`, { name: "Nueva", password: "short" });
  check("contraseña corta -> 400", a4.status === 400, `dio ${a4.status}`);
  const a5 = await anon.req("POST", `/api/invite/${okInv.token}/accept`, { name: "Nueva", password: "12345678" });
  check("aceptar creando cuenta -> 200", a5.status === 200, `dio ${a5.status}`);
  const created = await prisma.user.findFirst({ where: { email: `nueva-${stamp}@a.test` } });
  const m = created && (await prisma.membership.findFirst({ where: { userId: created.id, workspaceId: A.ws.id } }));
  check("quedó como miembro de A, y de ningún otro equipo", !!m && m.role === "MEMBER" && (await prisma.membership.count({ where: { userId: created.id } })) === 1);
  const a6 = await anon.req("POST", `/api/invite/${okInv.token}/accept`, { name: "Otra", password: "12345678" });
  check("el mismo enlace no se puede usar dos veces", a6.status === 410, `dio ${a6.status}`);
  const exist = await mkInvite(A.ws.id, bOwner.email);
  const a7 = await anon.req("POST", `/api/invite/${exist.token}/accept`, { name: "x", password: "12345678" });
  check("con cuenta existente y sin sesión: pide iniciar sesión (401)", a7.status === 401, `dio ${a7.status}`);
  const a8 = await cBOwner.req("POST", `/api/invite/${exist.token}/accept`, {});
  check("con sesión del email invitado se une", a8.status === 200, `dio ${a8.status}`);
  check("Beto ahora es miembro de A y sigue siendo dueño de B", (await prisma.membership.count({ where: { userId: bOwner.id } })) === 2);
  // Roles
  const r1 = await cAMember.req("PATCH", `/api/workspaces/members/${aMember.id}`, { role: "OWNER" });
  check("un miembro no se asciende a dueño", r1.status === 403, `dio ${r1.status}`);
  const r2 = await cAOwner.req("PATCH", `/api/workspaces/members/${aOwner.id}`, { role: "MEMBER" });
  check("el último dueño no puede bajarse el rol", r2.status >= 400 && r2.status < 500, `dio ${r2.status}`);
  const r3 = await cAOwner.req("PATCH", `/api/workspaces/members/${aMember.id}`, { role: "ADMIN" });
  check("el dueño asciende a admin", r3.status === 200, `dio ${r3.status}`);
  const r4 = await cAOwner.req("PATCH", `/api/workspaces/members/${bOwner.id}`, { role: "MEMBER" });
  check("cambiar rol a alguien de otro equipo no aplica", r4.status !== 200 || (await prisma.membership.findFirst({ where: { userId: bOwner.id, workspaceId: B.ws.id } })).role === "OWNER");
  // Crear equipo y salir
  const w1 = await cAMember.req("POST", "/api/workspaces", { name: `Equipo nuevo ${stamp}` });
  check("crear un equipo propio -> 201", w1.status === 201, `dio ${w1.status}`);
  const w1b = await prisma.membership.findFirst({ where: { userId: aMember.id, workspace: { name: `Equipo nuevo ${stamp}` } } });
  check("quien lo crea es dueño", w1b?.role === "OWNER");
  const lv1 = await cAOwner.req("POST", "/api/workspaces/leave");
  check("el último dueño no puede salirse", lv1.status >= 400 && lv1.status < 500, `dio ${lv1.status}`);
  const lv2 = await cMulti.req("POST", "/api/workspaces/leave");
  check("un admin puede salirse", lv2.status === 200, `dio ${lv2.status}`);
  check("Marta sigue en B", (await prisma.membership.count({ where: { userId: multi.id, workspaceId: B.ws.id } })) === 1);

  console.log("7) Fase 3: integraciones por equipo");
  const GKEY = `AIzaSyTESTKEY${stamp}abcdefghijklmnop`;
  const plain = await mkUser("Pablo Plano", `pablo-${stamp}@a.test`);
  await member(plain.id, A.ws.id, "MEMBER");
  const cPlain = await new Client("Pablo (miembro A)").login(plain.email);
  const ig0 = await cPlain.req("PUT", "/api/workspaces/integrations", { geminiKey: GKEY });
  check("un miembro no puede guardar claves", ig0.status === 403, `dio ${ig0.status}`);
  const ig1 = await cAOwner.req("PUT", "/api/workspaces/integrations", { geminiKey: GKEY });
  check("el dueño guarda la clave de Gemini", ig1.status === 200, `dio ${ig1.status}`);
  const ig2 = await cAOwner.req("GET", "/api/workspaces/integrations");
  check("GET informa que hay clave pero no la devuelve", ig2.json?.gemini?.own === true && !ig2.text.includes(GKEY) && ig2.json.gemini.hint === GKEY.slice(-4));
  const rowA = await prisma.workspace.findUnique({ where: { id: A.ws.id } });
  check("la clave está cifrada en la base", !!rowA.geminiKeyEnc && !rowA.geminiKeyEnc.includes(GKEY));
  const ig3 = await cBOwner.req("GET", "/api/workspaces/integrations");
  check("el equipo B no ve la clave de A", ig3.json?.gemini?.own === false);
  const ig4 = await cAMember.req("GET", "/api/workspaces/integrations");
  check("Aldo (ahora admin en A) ve la configuración de A", ig4.status === 200 && ig4.json?.gemini?.own === true);
  const ig5 = await cAOwner.req("PUT", "/api/workspaces/integrations", { slackBotToken: "no-es-un-token" });
  check("token de Slack inválido -> 400", ig5.status === 400, `dio ${ig5.status}`);
  const ig6 = await cAOwner.req("PUT", "/api/workspaces/integrations", { slackBotToken: `xoxb-${"1".repeat(30)}` });
  check("token de Slack válido se guarda", ig6.status === 200, `dio ${ig6.status}`);
  const ig7 = await cAOwner.req("PUT", "/api/workspaces/integrations", { geminiKey: null, slackBotToken: null });
  const rowA2 = await prisma.workspace.findUnique({ where: { id: A.ws.id } });
  check("borrar deja todo vacío", ig7.status === 200 && !rowA2.geminiKeyEnc && !rowA2.slackBotEnc);

  console.log("8) Comandos del chat");
  const cm1 = await cPlain.req("POST", "/api/chat/command", { body: "/noti general hola" });
  check("un miembro no puede /noti general", cm1.status === 403, `dio ${cm1.status}`);
  const cm2 = await cPlain.req("POST", "/api/chat/command", { body: "/reunion mañana: x" });
  check("un miembro no puede /reunion", cm2.status === 403, `dio ${cm2.status}`);
  const cm3 = await cPlain.req("POST", "/api/chat/command", { body: "/noti persona Aldo, Ana: ojo con esto" });
  check("un miembro sí puede /noti persona (varias personas)", cm3.status === 200, `dio ${cm3.status} ${cm3.text}`);
  await member((await mkUser("Bruno Solo B", `bruno-${stamp}@b.test`)).id, B.ws.id, "MEMBER");
  const cm4 = await cPlain.req("POST", "/api/chat/command", { body: "/noti persona Bruno: hola" });
  check("no encuentra a una persona de otro equipo (solo de B)", cm4.status === 400 && /No encontré/.test(cm4.json?.error ?? ""), `dio ${cm4.status} ${cm4.text}`);
  const cm5 = await cAOwner.req("POST", "/api/chat/command", { body: "/noti slack hola" });
  check("/noti slack sin webhook del equipo -> 400", cm5.status === 400, `dio ${cm5.status}`);
  const cm6 = await cAOwner.req("POST", "/api/chat/command", { body: "/noti general Aviso para todos" });
  check("el dueño puede /noti general", cm6.status === 200, `dio ${cm6.status}`);
  const cm8 = await cAOwner.req("POST", "/api/chat/command", { body: "/urgente servidor caído" });
  check("el dueño puede /urgente", cm8.status === 200, `dio ${cm8.status}`);
  const urg = await prisma.chatMessage.findFirst({ where: { workspaceId: A.ws.id, level: "URGENTE" } });
  check("el aviso urgente queda en el chat de A, con nivel", !!urg && urg.body === "servidor caído");
  check("y no aparece en el chat de B", (await prisma.chatMessage.count({ where: { workspaceId: B.ws.id, level: { not: null } } })) === 0);
  const cm9 = await cPlain.req("POST", "/api/chat/command", { body: "/ayuda necesito ayuda" });
  check("un miembro sí puede pedir /ayuda al equipo", cm9.status === 200, `dio ${cm9.status}`);
  const cm10 = await cPlain.req("POST", "/api/chat/command", { body: "/urgente x" });
  check("un miembro no puede /urgente", cm10.status === 403, `dio ${cm10.status}`);
  const cm7 = await cAOwner.req("POST", "/api/chat/command", { body: "/noti inventado" });
  check("comando inválido -> 400", cm7.status === 400);
  const hk = await cAOwner.req("PUT", "/api/workspaces/integrations", { slackWebhook: "https://example.com/x" });
  check("webhook de Slack con URL ajena se rechaza", hk.status === 400, `dio ${hk.status}`);

  console.log("9) Canales del chat");
  const ch1 = await cAOwner.req("GET", "/api/chat/channels");
  check("A tiene General y Reuniones", ch1.status === 200 && ch1.json.some((c) => c.kind === "GENERAL") && ch1.json.some((c) => c.kind === "REUNIONES"));
  const chB = (await cBOwner.req("GET", "/api/chat/channels")).json;
  check("los canales de B son otros", chB.every((c) => !ch1.json.some((x) => x.id === c.id)));
  const ch2 = await cPlain.req("POST", "/api/chat/channels", { name: "Soporte" });
  check("un miembro no crea canales", ch2.status === 403, `dio ${ch2.status}`);
  const ch3 = await cAOwner.req("POST", "/api/chat/channels", { name: "Soporte" });
  check("el dueño crea un canal", ch3.status === 201, `dio ${ch3.status}`);
  const ch4 = await cAOwner.req("POST", "/api/chat/channels", { name: "soporte" });
  check("nombre repetido -> 400", ch4.status === 400, `dio ${ch4.status}`);
  const ch5 = await cBOwner.req("DELETE", `/api/chat/channels/${ch3.json.id}`);
  // (Beto también es miembro de A desde la sección 6, así que ahí recibe 403; sin ser miembro sería 404.)
  check("Beto (dueño de B, solo miembro en A) no borra un canal de A", ch5.status === 403 || ch5.status === 404, `dio ${ch5.status}`);
  const ch6 = await cPlain.req("DELETE", `/api/chat/channels/${ch3.json.id}`);
  check("un miembro no borra canales", ch6.status === 403, `dio ${ch6.status}`);
  const gen = ch1.json.find((c) => c.kind === "GENERAL"), reu = ch1.json.find((c) => c.kind === "REUNIONES");
  check("no se borra General", (await cAOwner.req("DELETE", `/api/chat/channels/${gen.id}`)).status === 400);
  const p1 = await cPlain.req("POST", "/api/chat/messages", { body: "hola soporte", channelId: ch3.json.id });
  check("se puede escribir en un canal propio", p1.status === 201, `dio ${p1.status}`);
  const p2 = await cPlain.req("POST", "/api/chat/messages", { body: "intruso", channelId: chB[0].id });
  check("no se escribe en un canal de otro equipo", p2.status === 400, `dio ${p2.status}`);
  const l1 = await cPlain.req("GET", `/api/chat/messages?channel=${ch3.json.id}`);
  check("el canal Soporte solo tiene su mensaje", l1.json.messages.length === 1 && l1.json.messages[0].body === "hola soporte");
  const l2 = await cPlain.req("GET", `/api/chat/messages?channel=${gen.id}`);
  check("General no incluye los de Soporte, pero sí los anteriores sin canal", !l2.json.messages.some((m) => m.body === "hola soporte") && l2.json.messages.some((m) => m.body.startsWith("Chat secreto A")));
  const l3 = await cPlain.req("GET", `/api/chat/messages?channel=${chB[0].id}`);
  check("pedir un canal de otro equipo no devuelve nada", l3.json.messages.length === 0);
  await cAOwner.req("POST", "/api/chat/command", { body: "/reunion viernes 10:00: retro" });
  const l4 = await cPlain.req("GET", `/api/chat/messages?channel=${reu.id}`);
  check("/reunion queda en el canal Reuniones", l4.json.messages.some((m) => m.body.includes("retro")));
  const l5 = await cPlain.req("GET", `/api/chat/messages?channel=${gen.id}`);
  check("y no en General", !l5.json.messages.some((m) => m.body.includes("retro")));
  const l6 = await cPlain.req("GET", "/api/chat/messages?announce=1");
  check("announce=1 trae los avisos (reunión y urgente) y no los mensajes normales", l6.json.messages.some((m) => m.body.includes("retro")) && l6.json.messages.some((m) => m.level === "URGENTE") && !l6.json.messages.some((m) => m.body === "hola soporte"));
  const dl = await cAOwner.req("DELETE", `/api/chat/channels/${ch3.json.id}`);
  const l7 = await cPlain.req("GET", `/api/chat/messages?channel=${gen.id}`);
  check("al borrar un canal sus mensajes pasan a General", dl.status === 200 && l7.json.messages.some((m) => m.body === "hola soporte"));

  console.log("10) Menciones por código (#SAI, #SAI-1)");
  const km = await cPlain.req("POST", "/api/chat/messages", { body: "ver #SAI y #SAI-1 y #NOEXISTE" });
  check("mensaje con códigos se crea", km.status === 201, `dio ${km.status}`);
  const refs = await prisma.chatRef.findMany({ where: { messageId: km.json.id } });
  check("#SAI apunta al proyecto de SU equipo (B también usa SAI)", refs.some((r) => r.kind === "PROJECT" && r.targetId === A.project.id) && !refs.some((r) => r.targetId === B.project.id));
  check("#SAI-1 apunta al ticket de su equipo", refs.some((r) => r.kind === "ISSUE" && r.targetId === A.task.id) && !refs.some((r) => r.targetId === B.task.id));
  check("un código que no existe queda como texto", km.json.body.includes("#NOEXISTE"));
  const kb = await cBOwner.req("POST", "/api/chat/messages", { body: "ver #SAI" });
  const refsB = await prisma.chatRef.findMany({ where: { messageId: kb.json.id } });
  check("en B, #SAI apunta al proyecto de B", refsB.some((r) => r.targetId === B.project.id) && !refsB.some((r) => r.targetId === A.project.id));

  console.log("11) Token IA: permiso de borrar");
  // (Marta salió de A en la sección 6: se la vuelve a agregar para probar el token.)
  await prisma.membership.upsert({ where: { userId_workspaceId: { userId: multi.id, workspaceId: A.ws.id } }, create: { userId: multi.id, workspaceId: A.ws.id, role: "ADMIN" }, update: {} });
  const mine = await tk.req("POST", `/api/projects/${A.project.id}/issues`, { title: "para borrar con token" });
  const dl0 = await tk.req("DELETE", `/api/issues/${mine.json.id}`);
  check("sin 'permitir borrar' el token no borra (403)", dl0.status === 403, `dio ${dl0.status}`);
  await prisma.apiToken.updateMany({ where: { userId: multi.id }, data: { allowDelete: true } });
  const dl1 = await tk.req("DELETE", `/api/issues/${B.task.id}`);
  check("con permiso, no borra tickets de otro equipo (404)", dl1.status === 404, `dio ${dl1.status}`);
  check("y el ticket de B sigue ahí", !!(await prisma.task.findUnique({ where: { id: B.task.id } })));
  const dl2 = await tk.req("DELETE", `/api/projects/${A.project.id}`);
  check("con permiso, sigue sin poder borrar proyectos (403)", dl2.status === 403, `dio ${dl2.status}`);
  const dl3 = await tk.req("DELETE", `/api/issues/${mine.json.id}`);
  check("con permiso, borra un ticket de su equipo", dl3.status === 200 && !(await prisma.task.findUnique({ where: { id: mine.json.id } })), `dio ${dl3.status}`);
  const dl4 = await tk.req("DELETE", `/api/workspaces/leave`);
  check("con permiso, el token sigue sin poder salir de equipos ni administrar (403)", dl4.status === 403, `dio ${dl4.status}`);
  await prisma.apiToken.updateMany({ where: { userId: multi.id }, data: { allowDelete: false } });
  const dl5 = await tk.req("DELETE", `/api/notes/${A.note.id}`);
  check("al desactivarlo vuelve a no poder borrar (403)", dl5.status === 403, `dio ${dl5.status}`);

  console.log("12) Archivos y enlaces del proyecto");
  const rl = await cAOwner.req("POST", `/api/projects/${A.project.id}/resources`, { url: "drive.google.com/file/d/123", title: "Brief", tags: "brief, Brief, cliente", sprintId: A.sprint.id });
  check("agregar un enlace (con https automático y etiquetas sin repetir)", rl.status === 201 && rl.json.url.startsWith("https://drive.google.com") && rl.json.tags.length === 2 && rl.json.sprint?.id === A.sprint.id, `dio ${rl.status} ${rl.text.slice(0, 120)}`);
  const rbad = await cAOwner.req("POST", `/api/projects/${A.project.id}/resources`, { url: "javascript:alert(1)" });
  check("un enlace javascript: se rechaza", rbad.status === 400, `dio ${rbad.status}`);
  const rsp = await cAOwner.req("POST", `/api/projects/${A.project.id}/resources`, { url: "https://a.com", sprintId: B.sprint.id });
  check("no se asocia a un sprint de otro proyecto", rsp.status === 400, `dio ${rsp.status}`);
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([1, 2, 3, 4])], "contrato.pdf", { type: "application/pdf" }));
  fd.append("tags", "contrato");
  fd.append("taskId", A.task.id);
  const rf = await fetch(`${BASE}/api/projects/${A.project.id}/resources`, { method: "POST", headers: { Cookie: cPlain.header() }, body: fd });
  const rfj = await rf.json();
  check("un miembro sube un archivo asociado a un ticket", rf.status === 201 && rfj.task?.id === A.task.id && rfj.kind === "FILE", `dio ${rf.status}`);
  const dlf = await fetch(`${BASE}/api/resources/${rfj.id}/file`, { headers: { Cookie: cPlain.header() } });
  check("se descarga el archivo con su contenido", dlf.status === 200 && (await dlf.arrayBuffer()).byteLength === 4);
  const lst = await cPlain.req("GET", `/api/projects/${A.project.id}/resources`);
  check("la lista trae ambos y no incluye el contenido", lst.status === 200 && lst.json.length === 2 && !lst.text.includes('"data"'));
  const bOnly = await mkUser("Solo B Files", `solob-${stamp}@b.test`);
  await member(bOnly.id, B.ws.id, "OWNER");
  const cBOnly = await new Client("solo B").login(bOnly.email);
  const x1 = await cBOnly.req("GET", `/api/resources/${rfj.id}/file`);
  check("alguien solo de B no descarga archivos de A (404)", x1.status === 404, `dio ${x1.status}`);
  const x2 = await cBOnly.req("PATCH", `/api/resources/${rfj.id}`, { title: "hack" });
  check("ni los edita (404)", x2.status === 404, `dio ${x2.status}`);
  const x3 = await cBOnly.req("DELETE", `/api/resources/${rfj.id}`);
  check("ni los borra (404)", x3.status === 404, `dio ${x3.status}`);
  const x4 = await cBOnly.req("GET", `/api/projects/${A.project.id}/resources`);
  check("ni los lista (404)", x4.status === 404, `dio ${x4.status}`);
  const e1 = await cPlain.req("PATCH", `/api/resources/${rl.json.id}`, { title: "mío ahora" });
  check("un miembro no edita lo que subió otra persona (403)", e1.status === 403, `dio ${e1.status}`);
  const e2 = await cPlain.req("PATCH", `/api/resources/${rfj.id}`, { tags: ["contrato", "firmado"], taskId: null });
  check("quien lo subió sí edita etiquetas y a qué pertenece", e2.status === 200 && e2.json.tags.length === 2 && e2.json.task === null, `dio ${e2.status}`);
  const e3 = await cAOwner.req("DELETE", `/api/resources/${rfj.id}`);
  check("un líder borra archivos de otros", e3.status === 200 && !(await prisma.projectResource.findUnique({ where: { id: rfj.id } })), `dio ${e3.status}`);
  const tkr = await tk.req("GET", `/api/projects/${A.project.id}/resources`);
  check("el token IA no accede a archivos (403)", tkr.status === 403, `dio ${tkr.status}`);

  console.log("13) Sprint 2: miembros del proyecto, involucrados, menciones y fechas del checklist");
  const mem1 = await cPlain.req("PUT", `/api/projects/${A.project.id}/members`, { userIds: [aMember.id] });
  check("un miembro no define el equipo del proyecto (403)", mem1.status === 403, `dio ${mem1.status}`);
  const mem2 = await cAOwner.req("PUT", `/api/projects/${A.project.id}/members`, { userIds: [aMember.id, plain.id, bOwner.id, bOnly.id] });
  check("el líder define el equipo (solo personas de su equipo)", mem2.status === 200, `dio ${mem2.status}`);
  const memRows = await prisma.projectMember.findMany({ where: { projectId: A.project.id } });
  check("quedan Aldo y Pablo, y NO alguien que solo es de B", memRows.some((r) => r.userId === aMember.id) && memRows.some((r) => r.userId === plain.id) && !memRows.some((r) => r.userId === bOnly.id), `${memRows.length} filas`);
  const mem3 = await cBOnly.req("PUT", `/api/projects/${A.project.id}/members`, { userIds: [bOnly.id] });
  check("alguien de otro equipo no toca el equipo del proyecto (404)", mem3.status === 404, `dio ${mem3.status}`);
  const inv1 = await cPlain.req("PUT", `/api/issues/${A.task.id}/involved`, { userIds: [aOwner.id, bOnly.id] });
  check("un miembro agrega involucrados; los de otro equipo se ignoran", inv1.status === 200 && inv1.json.involved.length === 1 && inv1.json.involved[0].id === aOwner.id, `dio ${inv1.status} ${inv1.text.slice(0, 100)}`);
  const inv2 = await cBOnly.req("PUT", `/api/issues/${A.task.id}/involved`, { userIds: [bOnly.id] });
  check("alguien de otro equipo no toca los involucrados (404)", inv2.status === 404, `dio ${inv2.status}`);
  const bkey = await cPlain.req("GET", `/api/issues/by-key/SAI-1`);
  check("el detalle del ticket trae los involucrados", bkey.status === 200 && bkey.json.involved?.some((u) => u.id === aOwner.id), `dio ${bkey.status}`);
  const cmt = await cPlain.req("POST", `/api/issues/${A.task.id}/comments`, { body: "hola @Ana Dueña A y @Bruno Solo B, revisen" });
  check("comentar con menciones funciona", cmt.status === 201, `dio ${cmt.status}`);
  const chk = await cPlain.req("PATCH", `/api/issues/${A.task.id}`, { checklist: [{ id: "a1", text: "paso uno", done: false, due: "2026-12-31" }, { id: "a2", text: "paso dos", done: false, due: null }] });
  check("la checklist guarda fechas", chk.status === 200, `dio ${chk.status}`);
  const chkRow = await prisma.task.findUnique({ where: { id: A.task.id } });
  check("queda la fecha del primer paso y el segundo sin fecha", chkRow.checklist.includes('"due":"2026-12-31"') && !chkRow.checklist.includes('"due":null'), chkRow.checklist);
  const chkBad = await cPlain.req("PATCH", `/api/issues/${A.task.id}`, { checklist: [{ id: "a1", text: "x", done: false, due: "mañana" }] });
  check("una fecha inválida se rechaza (400)", chkBad.status === 400, `dio ${chkBad.status}`);

  console.log("14) Exportar el proyecto en JSON para IA");
  await prisma.project.update({ where: { id: A.project.id }, data: { slackWebhookUrl: "https://hooks.slack.com/services/T000/B000/SECRETOSECRETO", discordWebhookUrl: "https://discord.com/api/webhooks/1/SECRETODISCORD", telegramBotToken: "123:SECRETOTELEGRAM" } });
  const ex1 = await cPlain.req("GET", `/api/projects/${A.project.id}/export-json?scope=full&comments=5`);
  check("un miembro exporta el proyecto completo", ex1.status === 200 && ex1.json?._meta?.format === "scrum-proshop-export" && ex1.json.project.id === A.project.id, `dio ${ex1.status}`);
  check("trae tickets, sprints, notas y archivos", ex1.json.epics !== undefined && ex1.json.sprints?.length >= 1 && ex1.json.notes?.length >= 1 && Array.isArray(ex1.json.archivos));
  check("NO incluye webhooks, tokens ni claves", !/SECRETO|hooks\.slack|discord\.com\/api|geminiKey|tokenHash|passwordHash/i.test(ex1.text));
  check("NO incluye correos de personas", !ex1.text.includes("@a.test") && !ex1.text.includes("@b.test"));
  check("no mezcla datos de otro equipo", !ex1.text.includes("Chat secreto B") && !ex1.text.includes("Proyecto B") && !ex1.text.includes("Ticket B"));
  const ex2 = await cPlain.req("GET", `/api/projects/${A.project.id}/export-json?scope=tasks&anonymize=1`);
  check("modo tareas es más corto y no trae sprints ni notas", ex2.status === 200 && ex2.json.sprints === undefined && ex2.json.notes === undefined && ex2.text.length < ex1.text.length);
  check("anonimizar quita los nombres de las personas", !/Ana Dueña|Aldo Miembro|Pablo Plano|Marta Multi/.test(ex2.text) && ex2.json._meta.anonimizado === true);
  const ex3 = await cBOnly.req("GET", `/api/projects/${A.project.id}/export-json`);
  check("alguien solo de B no exporta el proyecto de A (404)", ex3.status === 404, `dio ${ex3.status}`);
  const ex4 = await tk.req("GET", `/api/projects/${A.project.id}/export-json?scope=tasks`);
  check("el token IA sí puede leer la exportación de su equipo", ex4.status === 200, `dio ${ex4.status}`);
  const ex5 = await tk.req("GET", `/api/projects/${B.project.id}/export-json`);
  check("pero no la de otro equipo (404)", ex5.status === 404, `dio ${ex5.status}`);
  // Ida y vuelta: lo exportado se puede importar como un proyecto nuevo.
  const rt = await cAOwner.req("POST", "/api/ai/import", { project: { name: `Copia ${stamp}` }, epics: ex1.json.epics, stories: ex1.json.stories, tasks: ex1.json.tasks });
  check("el JSON exportado se importa tal cual como proyecto nuevo", rt.status === 200 && rt.json?.project?.created === true, `dio ${rt.status} ${rt.text.slice(0, 200)}`);
  const rt2 = await cAOwner.req("POST", "/api/ai/import", { project: { id: rt.json.project.id }, epics: ex1.json.epics, stories: ex1.json.stories, tasks: ex1.json.tasks });
  check("y repetirlo no duplica nada", rt2.status === 200 && (rt2.json.created.tasks.length + rt2.json.created.stories.length + rt2.json.created.epics.length) === 0, `dio ${rt2.status} ${rt2.text.slice(0, 200)}`);

  console.log("15) Sprint 3: enlaces de Drive y cambios por JSON");
  const drx = await cPlain.req("POST", `/api/projects/${A.project.id}/resources`, { url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit", taskId: A.task.id });
  check("un enlace de Drive sin título recibe un nombre amable y vista previa", drx.status === 201 && drx.json.title === "Documento de Google" && drx.json.preview?.endsWith("/preview") && drx.json.service === "Google Drive", `dio ${drx.status} ${drx.text.slice(0, 160)}`);
  const dr2x = await cPlain.req("GET", `/api/projects/${A.project.id}/resources?task=${A.task.id}`);
  check("se listan los enlaces de un ticket", dr2x.status === 200 && dr2x.json.length >= 1 && dr2x.json.every((r) => r.task?.id === A.task.id));
  const ch0x = await cPlain.req("POST", "/api/ai/changes", { project: { id: A.project.id }, changes: [{ key: "SAI-1", status: "IN_PROGRESS", priority: "URGENTE", storyPoints: 8, assignee: "Aldo", sprint: "Sprint A", comment: "Ajuste por la IA" }] });
  check("cambios por JSON: se aplican estado, prioridad, puntos, responsable y comentario (el sprint ya era el mismo y no se toca)", ch0x.status === 200 && ch0x.json.applied.length === 1 && ch0x.json.failed.length === 0 && ch0x.json.applied[0].fields.length === 5 && !ch0x.json.applied[0].fields.includes("sprint"), `dio ${ch0x.status} ${ch0x.text.slice(0, 220)}`);
  const t1x = await prisma.task.findUnique({ where: { id: A.task.id } });
  check("quedaron guardados", t1x.status === "IN_PROGRESS" && t1x.priority === "URGENTE" && t1x.storyPoints === 8 && t1x.assigneeUserId === aMember.id && t1x.sprintId === A.sprint.id);
  check("y el comentario quedó a nombre de quien lo aplicó", (await prisma.comment.count({ where: { taskId: A.task.id, authorId: plain.id, body: "Ajuste por la IA" } })) === 1);
  const ch1x = await cPlain.req("POST", "/api/ai/changes", { project: { id: A.project.id }, changes: [{ key: "SAI-999", status: "DONE" }, { key: "XYZ-1", status: "DONE" }, { key: "SAI-1", assignee: "Nadie Existe" }, { key: "SAI-1", sprint: "No hay" }, { key: "SAI-1" }] });
  check("claves inexistentes, de otro proyecto y personas o sprints desconocidos fallan uno por uno; un cambio vacío cuenta como sin cambios", ch1x.status === 200 && ch1x.json.failed.length === 4 && ch1x.json.applied.length === 0 && ch1x.json.unchanged === 1, `${ch1x.status} ${ch1x.text.slice(0, 300)}`);
  const ch2x = await cBOnly.req("POST", "/api/ai/changes", { project: { id: A.project.id }, changes: [{ key: "SAI-1", status: "DONE" }] });
  check("alguien de otro equipo no cambia tickets de A (404)", ch2x.status === 404, `dio ${ch2x.status}`);
  const ch3x = await cPlain.req("POST", "/api/ai/changes", { project: { id: B.project.id }, changes: [{ key: "SAI-1", status: "DONE" }] });
  check("tampoco con el proyecto de B si no es miembro de B (404)", ch3x.status === 404, `dio ${ch3x.status}`);
  check("el ticket de B no se tocó", (await prisma.task.findUnique({ where: { id: B.task.id } })).status !== "DONE");
  const ch4x = await tk.req("POST", "/api/ai/changes", { project: { id: A.project.id }, changes: [{ key: "SAI-1", priority: "ALTA" }] });
  check("el token IA puede aplicar cambios en su equipo", ch4x.status === 200 && ch4x.json.applied.length === 1, `dio ${ch4x.status} ${ch4x.text.slice(0, 160)}`);
  const ch5x = await cPlain.req("POST", "/api/ai/changes", { project: { id: A.project.id }, changes: [{ key: "SAI-1", status: "HECHO" }] });
  check("un estado inválido se rechaza (400)", ch5x.status === 400, `dio ${ch5x.status}`);

  console.log("16) Biblioteca: tarjetas con varios archivos");
  const lc = await cPlain.req("POST", "/api/library/cards", { title: "Resolución reunión lunes", category: "RESOLUCION_REUNION", tags: ["reunión", "Reunión", "cliente"], projectId: A.project.id });
  check("un miembro crea una tarjeta (categoría, etiquetas sin repetir y proyecto)", lc.status === 201 && lc.json.category === "RESOLUCION_REUNION" && lc.json.tags.length === 2 && lc.json.project?.id === A.project.id, `dio ${lc.status} ${lc.text.slice(0, 160)}`);
  const lbadp = await cPlain.req("POST", "/api/library/cards", { title: "x", projectId: B.project.id });
  check("no se asocia a un proyecto de otro equipo (400)", lbadp.status === 400, `dio ${lbadp.status}`);
  const lfd = new FormData();
  for (const n of ["acta.pdf", "foto.png", "notas.txt"]) lfd.append("file", new File([new Uint8Array([1, 2, 3])], n, { type: n.endsWith("pdf") ? "application/pdf" : n.endsWith("png") ? "image/png" : "text/plain" }));
  const lup = await fetch(`${BASE}/api/library/cards/${lc.json.id}/items`, { method: "POST", headers: { Cookie: cPlain.header() }, body: lfd });
  const lupj = await lup.json();
  check("se suben 3 archivos de una sola vez", lup.status === 201 && lupj.items.length === 3, `dio ${lup.status}`);
  const llk = await cPlain.req("POST", `/api/library/cards/${lc.json.id}/items`, { url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn" });
  check("se agrega un enlace de Drive con nombre amable y vista previa", llk.status === 201 && llk.json.items.length === 4 && llk.json.items.some((i) => i.title === "Carpeta de Google Drive" && i.preview), `dio ${llk.status}`);
  const lbig = new FormData();
  lbig.append("file", new File([new Uint8Array(11 * 1024 * 1024)], "enorme.bin"));
  const lbigr = await fetch(`${BASE}/api/library/cards/${lc.json.id}/items`, { method: "POST", headers: { Cookie: cPlain.header() }, body: lbig });
  check("un archivo de más de 10 MB se rechaza (400)", lbigr.status === 400, `dio ${lbigr.status}`);
  const lgood = lupj.items.find((i) => i.filename === "foto.png");
  const ldl = await fetch(`${BASE}/api/library/items/${lgood.id}/file`, { headers: { Cookie: cAOwner.header() } });
  check("otro miembro del equipo descarga el archivo", ldl.status === 200 && (await ldl.arrayBuffer()).byteLength === 3);
  const llist = await cAOwner.req("GET", "/api/library/cards");
  check("la lista trae la tarjeta con sus 4 elementos y sin contenido", llist.status === 200 && llist.json.some((c) => c.id === lc.json.id && c.items.length === 4) && !llist.text.includes('"data"'));
  const lx1 = await cBOnly.req("GET", "/api/library/cards");
  check("alguien solo de B no ve la tarjeta de A", lx1.status === 200 && !lx1.json.some((c) => c.id === lc.json.id));
  const lx2 = await cBOnly.req("GET", `/api/library/items/${lgood.id}/file`);
  check("ni descarga sus archivos (404)", lx2.status === 404, `dio ${lx2.status}`);
  const lx3 = await cBOnly.req("DELETE", `/api/library/cards/${lc.json.id}`);
  check("ni la borra (404)", lx3.status === 404, `dio ${lx3.status}`);
  const lx4 = await cBOnly.req("POST", `/api/library/cards/${lc.json.id}/items`, { url: "https://a.com" });
  check("ni le agrega enlaces (404)", lx4.status === 404, `dio ${lx4.status}`);
  const lp1 = await cAMember.req("PATCH", `/api/library/cards/${lc.json.id}`, { title: "cambiado" });
  check("Aldo (admin de A) puede editarla por ser líder", lp1.status === 200, `dio ${lp1.status}`);
  const lowner2 = await cAOwner.req("POST", "/api/library/cards", { title: "De Ana" });
  const lp2 = await cPlain.req("PATCH", `/api/library/cards/${lowner2.json.id}`, { title: "hack" });
  check("un miembro no edita tarjetas de otra persona (403)", lp2.status === 403, `dio ${lp2.status}`);
  const lrm = await cPlain.req("DELETE", `/api/library/items/${lgood.id}`);
  check("quien la creó quita un archivo", lrm.status === 200 && lrm.json.items.length === 3, `dio ${lrm.status}`);
  const ldel = await cPlain.req("DELETE", `/api/library/cards/${lc.json.id}`);
  check("y borra la tarjeta con todo su contenido", ldel.status === 200 && (await prisma.fileCardItem.count({ where: { cardId: lc.json.id } })) === 0, `dio ${ldel.status}`);
  const ltk = await tk.req("GET", "/api/library/cards");
  check("el token IA no accede a la biblioteca (403)", ltk.status === 403, `dio ${ltk.status}`);

  console.log("17) Exportar, editar y volver a importar (actualiza y agrega)");
  const aiImportMod = await import("../src/lib/scrum/aiImport.ts");
  const splitExport = aiImportMod.splitExport ?? aiImportMod.default?.splitExport;
  const exA = await cAOwner.req("GET", `/api/projects/${A.project.id}/export-json?scope=tasks&comments=0`);
  const edited = JSON.parse(exA.text);
  const flat = [];
  const collect = (items) => items.forEach((i) => { flat.push(i); collect(i.stories ?? []); collect(i.tasks ?? []); });
  collect(edited.epics); collect(edited.stories ?? []); collect(edited.tasks ?? []);
  const target = flat.find((i) => i.type !== "EPIC" && i.status !== "DONE");
  target.status = "DONE";
  edited.tasks = [...(edited.tasks ?? []), { title: `Tarea nueva desde el JSON ${stamp}`, type: "BUG", priority: "ALTA" }];
  const sp = splitExport(edited);
  check("se separan los tickets existentes de los nuevos", sp.existing >= 1 && sp.fresh === 1 && sp.newImport?.tasks?.length === 1);
  const sy1 = await cAOwner.req("POST", "/api/ai/changes", { project: { id: sp.projectId }, changes: sp.changes });
  check("al aplicar, solo se actualiza el ticket que cambió; el resto queda sin cambios", sy1.status === 200 && sy1.json.applied.length === 1 && sy1.json.applied[0].key === target.key && sy1.json.applied[0].fields.includes("estado") && sy1.json.unchanged === sp.existing - 1 && sy1.json.failed.length === 0, `${sy1.status} ${sy1.text.slice(0, 260)}`);
  const dbT = await prisma.task.findFirst({ where: { projectId: A.project.id, title: target.title } });
  check("el estado quedó en Hecho en la base", dbT.status === "DONE");
  const sy2 = await cAOwner.req("POST", "/api/ai/import", sp.newImport);
  check("el ticket nuevo se crea", sy2.status === 200 && sy2.json.created.tasks.length === 1, `${sy2.status} ${sy2.text.slice(0, 160)}`);
  const sy3 = await cAOwner.req("POST", "/api/ai/changes", { project: { id: sp.projectId }, changes: sp.changes });
  const sy4 = await cAOwner.req("POST", "/api/ai/import", sp.newImport);
  check("repetirlo todo no cambia ni duplica nada", sy3.json.applied.length === 0 && sy3.json.unchanged === sp.existing && sy4.json.created.tasks.length === 0 && sy4.json.skipped.length >= 1, `${sy3.text.slice(0, 120)} / ${sy4.text.slice(0, 160)}`);

  console.log("18) Tokens IA con nombre y volver a copiar");
  const tl0k = await cMulti.req("GET", "/api/tokens");
  const legacyk = tl0k.json.tokens.find((t) => !t.canReveal);
  check("el token antiguo (sin copia cifrada) aparece y no se puede recuperar", tl0k.status === 200 && !!legacyk && legacyk.name === "Token");
  const tr0k = await cMulti.req("GET", `/api/tokens/${legacyk.id}/reveal`);
  check("pedir su valor da 409 con instrucciones para regenerar", tr0k.status === 409, `dio ${tr0k.status}`);
  const tc1k = await cMulti.req("POST", "/api/tokens", { name: "Claude de Marta", allowDelete: false });
  const tc2k = await cMulti.req("POST", "/api/tokens", { name: "ChatGPT" });
  check("se crean dos tokens con nombre", tc1k.status === 201 && tc2k.status === 201 && tc1k.json.token !== tc2k.json.token, `dio ${tc1k.status}/${tc2k.status}`);
  const tl1k = await cMulti.req("GET", "/api/tokens");
  check("la lista trae ambos con su nombre y se pueden volver a copiar", tl1k.json.tokens.some((t) => t.name === "Claude de Marta" && t.canReveal) && tl1k.json.tokens.some((t) => t.name === "ChatGPT" && t.canReveal));
  check("la lista nunca trae el valor del token", !tl1k.text.includes(tc1k.json.token) && !tl1k.text.includes("tokenEnc") && !tl1k.text.includes("tokenHash"));
  const trvk = await cMulti.req("GET", `/api/tokens/${tc1k.json.id}/reveal`);
  check("se vuelve a obtener el mismo token completo", trvk.status === 200 && trvk.json.token === tc1k.json.token);
  const tkNewk = new Client("token nuevo de Marta");
  tkNewk.bearer = trvk.json.token;
  const tusek = await tkNewk.req("GET", "/api/ai/projects");
  check("y el token recuperado funciona contra la API", tusek.status === 200, `dio ${tusek.status}`);
  const tselfk = await tkNewk.req("GET", "/api/tokens");
  check("un token IA no puede gestionar tokens (403)", tselfk.status === 403, `dio ${tselfk.status}`);
  const trvXk = await cAOwner.req("GET", `/api/tokens/${tc1k.json.id}/reveal`);
  check("otra persona no puede ver el token de Marta (404)", trvXk.status === 404, `dio ${trvXk.status}`);
  const tpXk = await cAOwner.req("PATCH", `/api/tokens/${tc1k.json.id}`, { name: "hack" });
  const tdXk = await cAOwner.req("DELETE", `/api/tokens/${tc1k.json.id}`);
  check("ni renombrarlo ni borrarlo (404)", tpXk.status === 404 && tdXk.status === 404, `${tpXk.status}/${tdXk.status}`);
  const trnk = await cMulti.req("PATCH", `/api/tokens/${tc2k.json.id}`, { name: "ChatGPT gratis", allowDelete: true });
  const tl2k = await cMulti.req("GET", "/api/tokens");
  check("se renombra y se activa el borrado en ese token solamente", trnk.status === 200 && tl2k.json.tokens.find((t) => t.id === tc2k.json.id).name === "ChatGPT gratis" && tl2k.json.tokens.find((t) => t.id === tc2k.json.id).allowDelete === true && tl2k.json.tokens.find((t) => t.id === tc1k.json.id).allowDelete === false);
  const tgenk = await cMulti.req("POST", `/api/tokens/${tc1k.json.id}/regenerate`);
  const tOldk = await tkNewk.req("GET", "/api/ai/projects");
  check("regenerar da un valor nuevo y el anterior deja de funcionar (401)", tgenk.status === 200 && tgenk.json.token !== tc1k.json.token && tOldk.status === 401, `${tgenk.status} / ${tOldk.status}`);
  const tgen2k = await cMulti.req("POST", `/api/tokens/${legacyk.id}/regenerate`);
  const tr1k = await cMulti.req("GET", `/api/tokens/${legacyk.id}/reveal`);
  check("regenerar un token antiguo lo vuelve recuperable", tgen2k.status === 200 && tr1k.status === 200 && tr1k.json.token === tgen2k.json.token);
  const trevk = await cMulti.req("DELETE", `/api/tokens/${tc2k.json.id}`);
  const tl3k = await cMulti.req("GET", "/api/tokens");
  check("revocar borra solo ese token", trevk.status === 200 && !tl3k.json.tokens.some((t) => t.id === tc2k.json.id) && tl3k.json.tokens.some((t) => t.id === tc1k.json.id));
  let createdk = tl3k.json.tokens.length;
  let lastStatusk = 201;
  while (createdk < 11 && lastStatusk === 201) { lastStatusk = (await cMulti.req("POST", "/api/tokens", { name: `t${createdk}` })).status; createdk++; }
  check("hay un tope de 10 tokens por persona", lastStatusk === 400, `dio ${lastStatusk}`);

  console.log("19) Avisos al teléfono (ntfy), con un servidor ntfy simulado");
  const nt0 = await cAOwner.req("GET", "/api/ntfy");
  if (!nt0.json?.configured) {
    console.log("  (omitido: el servidor de la prueba no tiene NTFY_BASE_URL; ver scripts/isolation-test.mjs)");
  } else {
    const got = [];
    const failTopics = new Set();
    const mock = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        got.push({ auth: req.headers.authorization, json });
        res.statusCode = json && failTopics.has(json.topic) ? 401 : 200;
        res.end("{}");
      });
    });
    await new Promise((r) => mock.listen(Number(new URL(process.env.NTFY_MOCK_URL ?? "http://localhost:3999").port), r));
    const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));
    try {
      const nAna = await cAOwner.req("POST", "/api/ntfy");
      const nAna2 = await cAOwner.req("POST", "/api/ntfy");
      check("activar crea un tema secreto con el formato esperado y repetirlo no lo cambia", nAna.status === 201 && /^scrum-[0-9a-f]{32}$/.test(nAna.json.channel.topic) && nAna2.json.channel.topic === nAna.json.channel.topic && nAna.json.channel.minimal === true, `${nAna.status} ${nAna.text.slice(0, 120)}`);
      const nAldo = await cAMember.req("POST", "/api/ntfy");
      const nPlain = await cPlain.req("POST", "/api/ntfy");
      const nBOnly = await cBOnly.req("POST", "/api/ntfy");
      check("cada persona tiene su propio tema", new Set([nAna, nAldo, nPlain, nBOnly].map((x) => x.json.channel.topic)).size === 4);
      const nSee = await cAOwner.req("GET", "/api/ntfy");
      check("cada quien solo ve su tema (no aparece el de otros)", nSee.json.channel.topic === nAna.json.channel.topic && !nSee.text.includes(nAldo.json.channel.topic) && !nSee.text.includes(nBOnly.json.channel.topic));
      const ntk = await tk.req("GET", "/api/ntfy");
      check("un token IA no accede a los avisos del teléfono (403)", ntk.status === 403, `dio ${ntk.status}`);

      got.length = 0;
      const nTest = await cAOwner.req("POST", "/api/ntfy/test");
      await wait();
      check("la prueba publica en el tema de Ana con el token del servidor y prioridad normal", nTest.status === 200 && got.length === 1 && got[0].auth === `Bearer ${process.env.NTFY_PUBLISH_TOKEN}` && got[0].json.topic === nAna.json.channel.topic && got[0].json.priority === 3, JSON.stringify(got[0]));

      // Mención en un comentario: contenido mínimo (sin el texto) y luego completo
      got.length = 0;
      await cPlain.req("POST", `/api/issues/${A.task.id}/comments`, { body: "hola @Ana Dueña A, revisa el SECRETO del cliente" });
      await wait();
      const mention = got.find((g) => g.json?.topic === nAna.json.channel.topic);
      check("mencionar a Ana le avisa a su teléfono con el enlace al ticket", !!mention && /te mencionó/.test(mention.json.title) && mention.json.click?.includes("issue=SAI-1"), JSON.stringify(mention));
      check("en contenido mínimo el aviso NO lleva el texto del comentario", mention && !JSON.stringify(mention.json).includes("SECRETO"));
      await cAOwner.req("PATCH", "/api/ntfy", { minimal: false });
      got.length = 0;
      await cPlain.req("POST", `/api/issues/${A.task.id}/comments`, { body: "otra vez @Ana Dueña A con SECRETO2" });
      await wait();
      check("con el contenido completo sí lleva el texto", got.some((g) => g.json?.topic === nAna.json.channel.topic && g.json.message.includes("SECRETO2")));

      // /urgente: prioridad máxima, a los de su equipo con canal; no a otro equipo
      got.length = 0;
      await cAOwner.req("POST", "/api/chat/command", { body: "/urgente servidor caído" });
      await wait(1000);
      const topicsHit = got.map((g) => g.json.topic);
      check("/urgente avisa con prioridad 5 a Aldo y a Pablo", got.filter((g) => g.json.priority === 5).length >= 2 && topicsHit.includes(nAldo.json.channel.topic) && topicsHit.includes(nPlain.json.channel.topic));
      check("no se avisa a quien envía el comando ni a alguien solo de otro equipo", !topicsHit.includes(nAna.json.channel.topic) && !topicsHit.includes(nBOnly.json.channel.topic));

      // Pausar, fallos permanentes y borrar
      await cAMember.req("PATCH", "/api/ntfy", { enabled: false });
      got.length = 0;
      await cAOwner.req("POST", "/api/chat/command", { body: "/ayuda necesito ayuda" });
      await wait();
      check("con los avisos pausados no se publica en su tema", !got.some((g) => g.json?.topic === nAldo.json.channel.topic));
      failTopics.add(nPlain.json.channel.topic);
      for (let i = 0; i < 4; i++) { await cAOwner.req("POST", "/api/chat/command", { body: `/noti persona Pablo: intento ${i}` }); await wait(500); }
      const chPlain = await prisma.ntfyChannel.findUnique({ where: { userId: plain.id } });
      check("tras 3 errores permanentes seguidos el canal se desactiva solo y guarda el motivo", chPlain.enabled === false && chPlain.failures >= 3 && !!chPlain.lastError, JSON.stringify(chPlain));
      const nShow = await cPlain.req("GET", "/api/ntfy");
      check("y se le avisa en pantalla", nShow.json.channel.disabledByErrors === true);
      const nDel = await cAOwner.req("DELETE", "/api/ntfy");
      check("quitar el canal borra el tema", nDel.status === 200 && (await prisma.ntfyChannel.count({ where: { userId: aOwner.id } })) === 0);
    } finally {
      mock.close();
    }
  }

  console.log("20) Avisos: bandeja, resumen, instantáneos, silencio y /reunion");
  const CRON = process.env.CRON_SECRET;
  if (!CRON) {
    console.log("  (omitido: el servidor de la prueba no tiene CRON_SECRET)");
  } else {
    const flush = (auth) => fetch(`${BASE}/api/cron/notifications`, { method: "POST", headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
    const nu = await mkUser("Nuevo Avisos", `avisos-${stamp}@a.test`);
    await member(nu.id, A.ws.id, "MEMBER");
    const cNu = await new Client("Nuevo (miembro A)").login(nu.email);
    const minutesFromNow = (d) => Math.round((d.getTime() - Date.now()) / 60000);

    const np0 = await cNu.req("GET", "/api/notifications/prefs");
    check("preferencias por defecto: resumen cada 30 min, sin silencio, nada silenciado", np0.status === 200 && np0.json.digestMinutes === 30 && np0.json.quietEnabled === false && np0.json.muted.length === 0, np0.text);
    // Asignaciones: la primera avisa ya; la segunda se junta
    const tA = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Avisos 1 ${stamp}`, assigneeUserId: nu.id });
    const tB = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Avisos 2 ${stamp}`, assigneeUserId: nu.id });
    const asg = await prisma.notification.findMany({ where: { userId: nu.id, kind: "ASSIGNED" }, orderBy: { createdAt: "asc" } });
    check("la primera asignación llega al instante (entregada y avisada)", asg.length === 2 && asg[0].deliveredAt !== null && asg[0].pushed === true, JSON.stringify(asg.map((a) => [a.deliveredAt, a.pushed])));
    check("la segunda, dentro de 2 minutos, queda pendiente para juntarse", asg[1].deliveredAt === null && minutesFromNow(asg[1].deliverAfter) <= 2, `${asg[1].deliverAfter}`);
    // Menciones: instantáneas
    await cPlain.req("POST", `/api/issues/${tA.json.id}/comments`, { body: "hola @Nuevo Avisos, mira esto" });
    const men = await prisma.notification.findFirst({ where: { userId: nu.id, kind: "MENTION" } });
    check("una mención llega al instante", !!men && men.deliveredAt !== null && men.pushed === true && men.url?.includes("issue="));
    // Cambios repetidos: se juntan en una línea
    for (let i = 0; i < 3; i++) await cPlain.req("POST", `/api/issues/${tA.json.id}/comments`, { body: `comentario ${i}` });
    const cms = await prisma.notification.findMany({ where: { userId: nu.id, kind: "COMMENT" } });
    check("tres comentarios en el mismo ticket son UNA línea pendiente con contador", cms.length === 1 && cms[0].count === 3 && cms[0].deliveredAt === null, JSON.stringify(cms.map((c) => [c.count, c.deliveredAt])));
    const done = await cAOwner.req("PATCH", `/api/issues/${tA.json.id}`, { status: "DONE" });
    check("completar el ticket queda pendiente de resumen (no suena)", done.status === 200 && (await prisma.notification.count({ where: { userId: nu.id, kind: "COMPLETED", deliveredAt: null } })) === 1);
    // Bandeja
    const inbox = await cNu.req("GET", "/api/notifications");
    check("la bandeja muestra todo (instantáneo y pendiente) con los sin leer", inbox.status === 200 && inbox.json.unread >= 5 && inbox.json.items.some((i) => i.pending) && inbox.json.items.some((i) => !i.pending));
    const otherMark = await cAOwner.req("POST", "/api/notifications/read", { ids: inbox.json.items.map((i) => i.id) });
    check("otra persona no puede marcar como leídos mis avisos", otherMark.status === 200 && otherMark.json.marked === 0 || (await prisma.notification.count({ where: { userId: nu.id, readAt: { not: null } } })) === 0);
    // Resumen: sin secreto no, con secreto sí, y repetirlo no duplica
    check("el resumen programado exige el secreto (401 sin él o con uno malo)", (await flush(null)).status === 401 && (await flush("malo")).status === 401);
    check("un token IA tampoco puede lanzar el resumen (401)", (await fetch(`${BASE}/api/cron/notifications`, { method: "POST", headers: { Authorization: `Bearer ${rawToken}` } })).status === 401);
    await prisma.notification.updateMany({ where: { userId: nu.id, deliveredAt: null }, data: { deliverAfter: new Date(Date.now() - 1000) } });
    const f1 = await flush(CRON);
    const f1j = await f1.json();
    const left = await prisma.notification.count({ where: { userId: nu.id, deliveredAt: null } });
    check("al cumplirse la ventana se envía UN resumen con todo lo pendiente", f1.status === 200 && f1j.people.users >= 1 && f1j.people.items >= 3 && left === 0, JSON.stringify(f1j));
    const f2j = await (await flush(CRON)).json();
    check("repetir el resumen no vuelve a enviar nada", f2j.people.items === 0, JSON.stringify(f2j));
    // Preferencias
    await cNu.req("PUT", "/api/notifications/prefs", { digestMinutes: 60 });
    await cPlain.req("POST", `/api/issues/${tB.json.id}/comments`, { body: "otro comentario" });
    const c60 = await prisma.notification.findFirst({ where: { userId: nu.id, kind: "COMMENT", groupKey: { contains: "comment-" }, deliveredAt: null } });
    check("con resumen cada hora, lo nuevo espera ~60 minutos", !!c60 && minutesFromNow(c60.deliverAfter) >= 58 && minutesFromNow(c60.deliverAfter) <= 61, `${c60?.deliverAfter}`);
    await prisma.notification.deleteMany({ where: { userId: nu.id, deliveredAt: null } });
    await cNu.req("PUT", "/api/notifications/prefs", { muted: ["tickets"], digestMinutes: 30 });
    await cPlain.req("POST", `/api/issues/${tB.json.id}/comments`, { body: "comentario silenciado" });
    const silent = await prisma.notification.findFirst({ where: { userId: nu.id, kind: "COMMENT" }, orderBy: { createdAt: "desc" } });
    check("una categoría silenciada queda solo en la bandeja (sin aviso)", silent.deliveredAt !== null && silent.pushed === false);
    await cNu.req("PUT", "/api/notifications/prefs", { muted: [] });
    const bad = await cNu.req("PUT", "/api/notifications/prefs", { digestMinutes: 7 });
    check("un intervalo inválido se rechaza (400)", bad.status === 400, `dio ${bad.status}`);
    // Horas de silencio: solo lo urgente atraviesa
    const hh = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    await cNu.req("PUT", "/api/notifications/prefs", { quietEnabled: true, tz: "UTC", quietStart: hh(new Date(Date.now() - 3600_000)), quietEnd: hh(new Date(Date.now() + 3600_000)) });
    await cPlain.req("POST", `/api/issues/${tB.json.id}/comments`, { body: "hola de nuevo @Nuevo Avisos" });
    const qm = await prisma.notification.findFirst({ where: { userId: nu.id, kind: "MENTION" }, orderBy: { createdAt: "desc" } });
    check("en horas de silencio una mención espera al fin del silencio", qm.deliveredAt === null && minutesFromNow(qm.deliverAfter) > 30, `${qm.deliverAfter}`);
    await cAOwner.req("POST", "/api/chat/command", { body: "/urgente servidor caído otra vez" });
    const qu = await prisma.notification.findFirst({ where: { userId: nu.id, kind: "URGENT" } });
    check("pero lo urgente sí avisa al instante", !!qu && qu.deliveredAt !== null && qu.pushed === true);
    await cNu.req("PUT", "/api/notifications/prefs", { quietEnabled: false });
    // /reunion: aviso instantáneo a todo el equipo
    await prisma.notification.deleteMany({ where: { kind: "REUNION" } });
    const ru = await cAOwner.req("POST", "/api/chat/command", { body: "/reunion viernes 10:00: retro del sprint" });
    const ruRows = await prisma.notification.findMany({ where: { kind: "REUNION" } });
    const ruUsers = ruRows.map((r) => r.userId);
    check("/reunion avisa al instante a todo el equipo menos a quien la convoca", ru.status === 200 && ruRows.length >= 3 && ruRows.every((r) => r.deliveredAt !== null && r.pushed === true) && ruUsers.includes(nu.id) && ruUsers.includes(plain.id) && !ruUsers.includes(aOwner.id), `${ru.status} ${ru.text.slice(0, 160)} filas=${ruRows.length}`);
    check("y no a alguien que solo es de otro equipo", !ruUsers.includes(bOnly.id));
    const ruInbox = await cPlain.req("GET", "/api/notifications");
    check("aparece en la bandeja con su etiqueta y con enlace al canal Reuniones", ruInbox.json.items.some((i) => i.kind === "REUNION" && i.label === "Reuniones" && i.url?.includes("canal=")), JSON.stringify(ruInbox.json.items.filter((i) => i.kind === "REUNION")));
    const ru2 = await cAOwner.req("POST", "/api/chat/command", { body: "/noti persona Pablo: te toca" });
    check("/noti persona también es instantáneo (mensaje directo)", ru2.status === 200 && (await prisma.notification.count({ where: { userId: plain.id, kind: "DIRECT", deliveredAt: { not: null }, pushed: true } })) >= 1);
    // Canales del proyecto: resumen cada X minutos
    const fd = await cAOwner.req("PATCH", `/api/projects/${A.project.id}`, { feedDigestMinutes: 30 });
    const fdBad = await cAOwner.req("PATCH", `/api/projects/${A.project.id}`, { feedDigestMinutes: 7 });
    check("el líder define cada cuánto va el resumen a Discord/Telegram/Slack (y 7 se rechaza)", fd.status === 200 && fdBad.status === 400, `${fd.status}/${fdBad.status}`);
    const beforeFeed = await prisma.projectFeedItem.count({ where: { projectId: A.project.id } });
    await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Para el resumen ${stamp}` });
    check("un ticket nuevo no se manda al canal al instante: queda en espera del resumen", (await prisma.projectFeedItem.count({ where: { projectId: A.project.id, sentAt: null } })) === beforeFeed + 1 || (await prisma.projectFeedItem.count({ where: { projectId: A.project.id } })) === beforeFeed + 1);
    await prisma.projectFeedItem.updateMany({ where: { projectId: A.project.id, sentAt: null }, data: { createdAt: new Date(Date.now() - 3600_000) } });
    const f3j = await (await flush(CRON)).json();
    check("al cumplirse la ventana sale un solo mensaje por proyecto", f3j.feeds.projects >= 1 && (await prisma.projectFeedItem.count({ where: { projectId: A.project.id, sentAt: null } })) === 0, JSON.stringify(f3j));
    await cAOwner.req("PATCH", `/api/projects/${A.project.id}`, { feedDigestMinutes: 0 });
    const beforeZero = await prisma.projectFeedItem.count({ where: { projectId: A.project.id } });
    await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Sin espera ${stamp}` });
    check("con 0 minutos no se guarda nada para resumir (sale al instante)", (await prisma.projectFeedItem.count({ where: { projectId: A.project.id } })) === beforeZero);
    const tkn = await tk.req("GET", "/api/notifications");
    check("el token IA no accede a la bandeja de avisos (403)", tkn.status === 403, `dio ${tkn.status}`);
  }

  console.log("21) Biblioteca: tarjetas de proyecto automáticas y notas por archivo");
  const bl1 = await cPlain.req("GET", "/api/library/cards");
  const autoA = bl1.json.find((c) => c.id === `project:${A.project.id}`);
  check("el proyecto con archivos tiene su tarjeta automática en la Biblioteca", bl1.status === 200 && !!autoA && autoA.auto === true && autoA.title === "Archivos de Proyecto A" && autoA.items.length >= 2, JSON.stringify(autoA?.title));
  const before = autoA.items.length;
  const upf = new FormData();
  upf.append("file", new File([new Uint8Array([9, 8, 7])], "plano.pdf", { type: "application/pdf" }));
  const upr = await fetch(`${BASE}/api/projects/${A.project.id}/resources`, { method: "POST", headers: { Cookie: cPlain.header() }, body: upf });
  const uprj = await upr.json();
  const bl2 = await cPlain.req("GET", "/api/library/cards");
  const autoA2 = bl2.json.find((c) => c.id === `project:${A.project.id}`);
  const it = autoA2.items.find((i) => i.filename === "plano.pdf");
  check("lo que se sube en la pestaña Archivos del proyecto aparece solo en esa tarjeta", upr.status === 201 && autoA2.items.length === before + 1 && !!it && it.fileUrl === `/api/resources/${uprj.id}/file` && it.uploadedBy === "Pablo Plano", JSON.stringify(it));
  const dlAuto = await fetch(`${BASE}${it.fileUrl}`, { headers: { Cookie: cAOwner.header() } });
  check("y se descarga desde ahí", dlAuto.status === 200 && (await dlAuto.arrayBuffer()).byteLength === 3);
  check("los enlaces de la tarjeta de proyecto traen su vista previa y nombre", autoA2.items.some((i) => i.kind === "LINK" && i.title.length > 0));
  const blB = await cBOnly.req("GET", "/api/library/cards");
  check("otro equipo no ve la tarjeta automática de A", blB.status === 200 && !blB.json.some((c) => c.id === `project:${A.project.id}`));
  check("un proyecto sin archivos no tiene tarjeta (el de B)", !blB.json.some((c) => c.id === `project:${B.project.id}`));
  const pa = await cAOwner.req("PATCH", `/api/library/cards/project:${A.project.id}`, { title: "hack" });
  const da = await cAOwner.req("DELETE", `/api/library/cards/project:${A.project.id}`);
  check("la tarjeta automática no se edita ni se borra como una tarjeta normal (404)", pa.status === 404 && da.status === 404, `${pa.status}/${da.status}`);
  await cPlain.req("DELETE", `/api/resources/${uprj.id}`);
  const bl3 = await cPlain.req("GET", "/api/library/cards");
  check("al borrar el archivo del proyecto desaparece de la tarjeta", bl3.json.find((c) => c.id === `project:${A.project.id}`).items.length === before);
  // Notas por archivo
  const nc = await cPlain.req("POST", "/api/library/cards", { title: "Contrato cliente (se va actualizando)", category: "CONTRATO" });
  const nfd = new FormData();
  nfd.append("file", new File([new Uint8Array([1, 2])], "borrador.pdf", { type: "application/pdf" }));
  nfd.append("note", "primer borrador sin firmar");
  const nup = await fetch(`${BASE}/api/library/cards/${nc.json.id}/items`, { method: "POST", headers: { Cookie: cPlain.header() }, body: nfd });
  const nupj = await nup.json();
  check("un archivo se sube con su nota", nup.status === 201 && nupj.items[0].note === "primer borrador sin firmar");
  const nlk = await cPlain.req("POST", `/api/library/cards/${nc.json.id}/items`, { url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit", note: "versión de legal" });
  check("un enlace también, y la tarjeta se va actualizando con el tiempo (2 elementos)", nlk.status === 201 && nlk.json.items.length === 2 && nlk.json.items.some((i) => i.note === "versión de legal"));
  const nid = nupj.items[0].id;
  const npt = await cPlain.req("PATCH", `/api/library/items/${nid}`, { title: "Contrato firmado v2", note: "ya firmado por ambos" });
  check("se cambia el título y la nota de un archivo", npt.status === 200 && npt.json.items.find((i) => i.id === nid).title === "Contrato firmado v2" && npt.json.items.find((i) => i.id === nid).note === "ya firmado por ambos", npt.text.slice(0, 200));
  const nptEmpty = await cPlain.req("PATCH", `/api/library/items/${nid}`, { title: "" });
  check("un título vacío se rechaza (400)", nptEmpty.status === 400, `dio ${nptEmpty.status}`);
  const nptOther = await cBOnly.req("PATCH", `/api/library/items/${nid}`, { note: "hack" });
  check("alguien de otro equipo no cambia notas (404)", nptOther.status === 404, `dio ${nptOther.status}`);
  const nlist = await cAOwner.req("GET", "/api/library/cards");
  check("la lista trae las notas, quién lo subió y cuándo", nlist.json.find((c) => c.id === nc.json.id).items.every((i) => typeof i.note === "string" && i.uploadedBy === "Pablo Plano" && !!i.createdAt));

  console.log("22) SCP-65: avisos de movimientos de tickets y de sus historias/épicas");
  const mvU = await mkUser("Dueña Historia", `historia-${stamp}@a.test`);
  await member(mvU.id, A.ws.id, "MEMBER");
  const cMv = await new Client("Dueña de la historia").login(mvU.email);
  const epicM = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Épica mov ${stamp}`, issueType: "EPIC" });
  const storyM = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Historia mov ${stamp}`, issueType: "STORY", epicId: epicM.json.id, assigneeUserId: mvU.id });
  const taskM = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Tarea mov ${stamp}`, issueType: "TASK", parentId: storyM.json.id, epicId: epicM.json.id, assigneeUserId: aMember.id });
  check("se arma la épica, la historia y la tarea", epicM.status === 201 && storyM.status === 201 && taskM.status === 201, `${epicM.status}/${storyM.status}/${taskM.status}`);
  const rowsOf = (userId, kind) => prisma.notification.findMany({ where: { userId, kind, groupKey: { contains: `status-` }, body: { contains: "Tarea mov" } } });
  const mv1M = await cAOwner.req("PATCH", `/api/issues/${taskM.json.id}`, { status: "IN_PROGRESS" });
  const stAldoM = await rowsOf(aMember.id, "STATUS");
  const stMvM = await rowsOf(mvU.id, "STATUS");
  check("mover a En progreso avisa al responsable y a quien es responsable de su historia (en el resumen, sin sonar)", mv1M.status === 200 && stAldoM.length === 1 && stMvM.length === 1 && stAldoM[0].deliveredAt === null && stMvM[0].deliveredAt === null, JSON.stringify([stAldoM.length, stMvM.length]));
  check("quien hace el movimiento no se avisa a sí mismo", (await prisma.notification.count({ where: { userId: aOwner.id, kind: "STATUS", body: { contains: "Tarea mov" } } })) === 0);
  await cAOwner.req("PATCH", `/api/issues/${taskM.json.id}`, { status: "IN_REVIEW" });
  const stAldo2M = await rowsOf(aMember.id, "STATUS");
  check("otro movimiento del mismo ticket se junta en la misma línea (contador 2)", stAldo2M.length === 1 && stAldo2M[0].count === 2, JSON.stringify(stAldo2M.map((r) => r.count)));
  await cAMember.req("PATCH", `/api/issues/${taskM.json.id}`, { status: "DONE" });
  const cmpM = await prisma.notification.findMany({ where: { kind: "COMPLETED", body: { contains: "Tarea mov" } } });
  const cmpUsers = cmpM.map((r) => r.userId);
  check("al completarlo avisa a quien lo reportó y a la dueña de la historia, y no a quien lo completó", cmpUsers.includes(aOwner.id) && cmpUsers.includes(mvU.id) && !cmpUsers.includes(aMember.id), JSON.stringify(cmpUsers));
  const unreadMvM = await cMv.req("GET", "/api/notifications?limit=1");
  check("el número de avisos sin leer (el de la insignia del icono) cuenta lo pendiente", unreadMvM.status === 200 && unreadMvM.json.unread >= 2, `${unreadMvM.json?.unread}`);
  await cMv.req("POST", "/api/notifications/read", { all: true });
  check("y vuelve a 0 al marcar todo como leído", (await cMv.req("GET", "/api/notifications?limit=1")).json.unread === 0);
  await cMv.req("PUT", "/api/notifications/prefs", { muted: ["tickets"] });
  const t2mv = await cAOwner.req("POST", `/api/projects/${A.project.id}/issues`, { title: `Tarea mov2 ${stamp}`, issueType: "TASK", parentId: storyM.json.id, epicId: epicM.json.id });
  await cAOwner.req("PATCH", `/api/issues/${t2mv.json.id}`, { status: "IN_PROGRESS" });
  const mutedM = await prisma.notification.findFirst({ where: { userId: mvU.id, kind: "STATUS", body: { contains: "Tarea mov2" } } });
  check("quien silenció los avisos de tickets los ve solo en la bandeja (sin sonar ni esperar resumen)", !!mutedM && mutedM.deliveredAt !== null && mutedM.pushed === false);

  console.log("23) Chat a pantalla completa: un canal por proyecto, sin leer y último mensaje");
  const cl0 = await cPlain.req("GET", "/api/chat/channels");
  const projCh = cl0.json.find((c) => c.projectId === A.project.id);
  check("cada proyecto tiene su canal (con el nombre y la clave del proyecto)", cl0.status === 200 && !!projCh && projCh.kind === "PROJECT" && projCh.name === "Proyecto A" && projCh.projectKey === "SAI", JSON.stringify(projCh));
  check("la lista trae el último mensaje y los sin leer de cada canal", cl0.json.every((c) => typeof c.unread === "number" && "last" in c));
  const clB = await cBOnly.req("GET", "/api/chat/channels");
  check("cada equipo ve solo los canales de sus proyectos", !clB.json.some((c) => c.projectId === A.project.id) && clB.json.some((c) => c.projectId === B.project.id));
  const pm = await cAOwner.req("POST", "/api/chat/messages", { body: "hola solo proyecto A", channelId: projCh.id });
  check("se escribe en el canal del proyecto", pm.status === 201, `dio ${pm.status}`);
  const inProj = await cPlain.req("GET", `/api/chat/messages?channel=${projCh.id}`);
  const generalCh = cl0.json.find((c) => c.kind === "GENERAL");
  const inGen = await cPlain.req("GET", `/api/chat/messages?channel=${generalCh.id}`);
  check("el mensaje está en el canal del proyecto y NO se mezcla en General", inProj.json.messages.some((m) => m.body === "hola solo proyecto A") && !inGen.json.messages.some((m) => m.body === "hola solo proyecto A"));
  const cl1 = await cPlain.req("GET", "/api/chat/channels");
  const projCh1 = cl1.json.find((c) => c.id === projCh.id);
  check("a otra persona le sale 1 sin leer y el último mensaje", projCh1.unread === 1 && projCh1.last?.text === "hola solo proyecto A" && projCh1.last?.author === "Ana Dueña A", JSON.stringify(projCh1));
  check("a quien lo escribió no le cuenta como sin leer", (await cAOwner.req("GET", "/api/chat/channels")).json.find((c) => c.id === projCh.id).unread === 0);
  const rd = await cPlain.req("POST", "/api/chat/read", { channelId: projCh.id });
  check("marcar el canal como leído deja 0 sin leer", rd.status === 200 && (await cPlain.req("GET", "/api/chat/channels")).json.find((c) => c.id === projCh.id).unread === 0);
  const rdX = await cBOnly.req("POST", "/api/chat/read", { channelId: projCh.id });
  check("no se puede marcar leído un canal de otro equipo (404)", rdX.status === 404, `dio ${rdX.status}`);
  const delP = await cAOwner.req("DELETE", `/api/chat/channels/${projCh.id}`);
  check("el canal de un proyecto no se borra a mano (400)", delP.status === 400, `dio ${delP.status}`);
  await cPlain.req("POST", "/api/chat/messages", { body: `ojo [[user:${aOwner.id}]] en el proyecto`, channelId: projCh.id });
  await new Promise((r) => setTimeout(r, 800)); // el aviso se manda sin esperar la respuesta
  const projMention = await prisma.notification.findFirst({ where: { userId: aOwner.id, kind: "MENTION", url: { contains: `canal=${projCh.id}` } } });
  check("una mención en el canal del proyecto lleva al canal", !!projMention);
  await cAOwner.req("PATCH", `/api/projects/${A.project.id}`, { name: "Proyecto A renombrado" });
  const clRen = await cPlain.req("GET", "/api/chat/channels");
  check("si se renombra el proyecto, su canal cambia de nombre solo", clRen.json.find((c) => c.projectId === A.project.id).name === "Proyecto A renombrado");
  await cAOwner.req("PATCH", `/api/projects/${A.project.id}`, { name: "Proyecto A" });
  const tmp = await cAOwner.req("POST", "/api/projects", { name: `Temporal ${stamp}`, description: "x" });
  const tmpCh = (await cAOwner.req("GET", "/api/chat/channels")).json.find((c) => c.projectId === tmp.json.id);
  check("un proyecto nuevo recibe su canal solo", tmp.status === 201 && !!tmpCh);
  await cAOwner.req("POST", "/api/chat/messages", { body: "mensaje del temporal", channelId: tmpCh.id });
  const tmpDel = await cAOwner.req("DELETE", `/api/projects/${tmp.json.id}`);
  check("al borrar el proyecto desaparecen su canal y sus mensajes (no pasan a General)", tmpDel.status === 200 && (await prisma.chatChannel.count({ where: { id: tmpCh.id } })) === 0 && (await prisma.chatMessage.count({ where: { body: "mensaje del temporal" } })) === 0);

  console.log("24) Subtareas con responsable y fecha");
  const subOk = await cPlain.req("PATCH", `/api/issues/${A.task.id}`, { checklist: [{ id: "s1", text: "Mejorar el diseño", done: false, assignee: aMember.id, due: "2026-12-01" }, { id: "s2", text: "Hacer las animaciones", done: true }] });
  const subRow = await prisma.task.findUnique({ where: { id: A.task.id } });
  check("una subtarea guarda su responsable y su fecha", subOk.status === 200 && subRow.checklist.includes(`"assignee":"${aMember.id}"`) && subRow.checklist.includes('"due":"2026-12-01"') && subRow.checklist.includes('"done":true'), subRow.checklist);
  const subBad = await cPlain.req("PATCH", `/api/issues/${A.task.id}`, { checklist: [{ id: "s1", text: "x", done: false, assignee: bOnly.id }] });
  check("no se puede asignar una subtarea a alguien de otro equipo (400)", subBad.status === 400, `dio ${subBad.status} ${subBad.text.slice(0, 100)}`);
  const subBk = await cPlain.req("GET", "/api/issues/by-key/SAI-1");
  check("el detalle del ticket devuelve las subtareas con su responsable", subBk.json.issue.checklist.some((c) => c.text === "Mejorar el diseño" && c.assignee === aMember.id));

  console.log(`\n${checks} comprobaciones, ${failures} fallas`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
