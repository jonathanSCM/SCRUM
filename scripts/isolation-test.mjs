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

  console.log(`\n${checks} comprobaciones, ${failures} fallas`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
