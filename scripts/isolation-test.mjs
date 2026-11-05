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

  console.log(`\n${checks} comprobaciones, ${failures} fallas`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
