import { NextResponse } from "next/server";
import { z } from "zod";
import { SLACK_CHANNEL_ID_PATTERN, SLACK_USER_ID_PATTERN, SLACK_WEBHOOK_PATTERN } from "@/lib/slack";
import { TELEGRAM_CHAT_PATTERN, TELEGRAM_TOKEN_PATTERN, TELEGRAM_USERNAME_PATTERN } from "@/lib/telegram";
import { ISSUE_TYPES, STATUSES, PRIORITIES } from "@/lib/scrum/constants";

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): { data: T } | { error: NextResponse } {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Datos inválidos";
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data };
}

// Lee el JSON del request sin explotar si viene vacío o malformado.
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const optionalDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida");

// ---- Cuentas ----

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  role: z.enum(["LEAD", "MEMBER"]).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email inválido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100).optional(),
  slackUserId: z
    .string()
    .trim()
    .refine((v) => v === "" || SLACK_USER_ID_PATTERN.test(v), "Tiene que ser tu ID de miembro de Slack (empieza con U o W, ej. U01ABCDE2F3)")
    .nullish(),
  telegramUsername: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || TELEGRAM_USERNAME_PATTERN.test(v), "Usuario de Telegram inválido (5 a 32 letras, números o _)")
    .nullish(),
  chatColor: z
    .string()
    .trim()
    .refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Color inválido (#RRGGBB)")
    .nullish(),
  discordUserId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, "Tiene que ser el ID numérico de Discord (17 a 20 dígitos)")
    .nullish()
    .or(z.literal("")),
});

export const telegramConfigSchema = z.object({
  // Vacío = quitar la configuración.
  botToken: z.string().trim().regex(TELEGRAM_TOKEN_PATTERN, "Token de bot inválido (formato 123456:ABC…)").or(z.literal("")),
  chatId: z.string().trim().regex(TELEGRAM_CHAT_PATTERN, "Chat inválido: usá el id numérico del grupo o @canal").or(z.literal("")),
});

export const slackWebhookSchema = z.object({
  slackWebhookUrl: z.string().trim().regex(SLACK_WEBHOOK_PATTERN, "Tiene que ser una URL de Incoming Webhook de Slack (https://hooks.slack.com/services/…)").or(z.literal("")).optional(),
  // Canal donde el bot sube el PDF del sprint (ID tipo C01ABCDE2F3, no el nombre).
  slackChannelId: z.string().trim().regex(SLACK_CHANNEL_ID_PATTERN, "ID de canal inválido (empieza con C o G, ej. C01ABCDE2F3)").or(z.literal("")).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Escribí tu contraseña actual"),
  newPassword: z.string().min(8, "La contraseña nueva debe tener al menos 8 caracteres").max(200),
});

// ---- Proyectos ----

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,4}$/, "La clave son 2 a 5 letras o números y empieza con una letra");

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  key: projectKeySchema.optional(),
  description: z.string().trim().max(5000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200).optional(),
  statusId: z.string().min(1).optional(),
  leadUserId: z.string().nullable().optional(),
  description: z.string().max(5000).optional(),
  deployUrl: z.string().trim().max(500).nullable().optional(),
  stack: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  readyItems: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
});

export const discordWebhookSchema = z.object({
  discordWebhookUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/discord(app)?\.com\/api\/webhooks\/.+/, "Tiene que ser una URL de webhook de Discord")
    .nullish()
    .or(z.literal("")),
});

export const statusOptionSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(60),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (usá #RRGGBB)"),
});

// ---- Tickets ----

const issueType = z.enum(ISSUE_TYPES);
const issueStatus = z.enum(STATUSES);
const priority = z.enum(PRIORITIES);
const storyPoints = z.number().int().min(0).max(100).nullable();
const labels = z.array(z.string().trim().min(1).max(30)).max(10);

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, "Título requerido").max(300),
  description: z.string().max(20000).optional(),
  issueType: issueType.optional(),
  status: issueStatus.optional(),
  priority: priority.optional(),
  storyPoints: storyPoints.optional(),
  labels: labels.optional(),
  readyDone: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  checklist: z.array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1).max(200), done: z.boolean() })).max(50).optional(),
  parentId: z.string().min(1).nullable().optional(),
  assigneeUserId: z.string().min(1).nullable().optional(),
  sprintId: z.string().min(1).nullable().optional(),
  epicId: z.string().min(1).nullable().optional(),
  epicColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  dueDate: optionalDate.nullable().optional(),
});

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1, "Título requerido").max(300).optional(),
  description: z.string().max(20000).optional(),
  issueType: issueType.optional(),
  status: issueStatus.optional(),
  priority: priority.optional(),
  storyPoints: storyPoints.optional(),
  labels: labels.optional(),
  readyDone: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  checklist: z.array(z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1).max(200), done: z.boolean() })).max(50).optional(),
  parentId: z.string().min(1).nullable().optional(),
  assigneeUserId: z.string().min(1).nullable().optional(),
  sprintId: z.string().min(1).nullable().optional(),
  epicId: z.string().min(1).nullable().optional(),
  epicColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  dueDate: optionalDate.nullable().optional(),
});

export const moveIssueSchema = z.object({
  issueId: z.string().min(1),
  sprintId: z.string().min(1).nullable().optional(), // omitido = no cambia
  status: issueStatus.optional(),
  prevId: z.string().min(1).nullable().optional(), // vecino de arriba
  nextId: z.string().min(1).nullable().optional(), // vecino de abajo
});

export const bulkIssuesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  patch: updateIssueSchema.pick({ sprintId: true, priority: true, assigneeUserId: true, status: true, epicId: true }),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(5000),
});

// ---- Sprints ----

export const createSprintSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100).optional(),
  goal: z.string().trim().max(500).optional(),
});

export const updateSprintSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100).optional(),
  goal: z.string().trim().max(500).optional(),
  startDate: optionalDate.nullable().optional(),
  endDate: optionalDate.nullable().optional(),
});

export const startSprintSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100).optional(),
  goal: z.string().trim().max(500).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  // Un líder puede iniciar aunque falte información (Definition of Ready).
  force: z.boolean().optional(),
});

export const completeSprintSchema = z.object({
  // "BACKLOG" o el id de otro sprint planificado
  destination: z.string().min(1),
});

// ---- Notas y chat ----

export const NOTE_KINDS = ["BRIEF", "REUNION", "PLANNING", "REVIEW", "GENERAL"] as const;

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, "Título requerido").max(200),
  body: z.string().max(50000).optional(),
  kind: z.enum(NOTE_KINDS).optional(),
  pinned: z.boolean().optional(),
});

export const updateNoteSchema = createNoteSchema.partial();

export const noteToTicketsSchema = z.object({
  items: z.array(z.string().trim().min(1).max(300)).min(1, "Elegí al menos un punto").max(30),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "El mensaje no puede estar vacío").max(3000),
});

// ---- Ceremonias ----

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const standupText = z.string().trim().max(2000).optional();

export const standupSchema = z.object({
  date: dateString,
  yesterday: standupText,
  today: standupText,
  blockers: standupText,
  help: standupText,
});

export const RETRO_COLUMNS = ["WENT_WELL", "IMPROVE", "ACTION"] as const;

export const retroItemSchema = z.object({
  sprintId: z.string().min(1),
  column: z.enum(RETRO_COLUMNS),
  body: z.string().trim().min(1, "Escribí algo").max(500),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100),
  role: z.string().trim().max(100).optional(),
  contact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export const updateContactSchema = contactSchema.partial();

export const chatMessageSchema = z.object({
  body: z.string().trim().max(4000),
  fileIds: z.array(z.string().min(1).max(40)).max(5).optional(),
  replyToId: z.string().min(1).max(40).nullish(),
});

export const chatReactionSchema = z.object({ emoji: z.string().min(1).max(16) });
