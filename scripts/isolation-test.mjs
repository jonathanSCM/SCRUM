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

  console.log(`\n${checks} comprobaciones, ${failures} fallas`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
