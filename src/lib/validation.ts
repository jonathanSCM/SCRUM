import { NextResponse } from "next/server";
import { z } from "zod";
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
  discordUserId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, "Tiene que ser el ID numérico de Discord (17 a 20 dígitos)")
    .nullish()
    .or(z.literal("")),
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
});

export const completeSprintSchema = z.object({
  // "BACKLOG" o el id de otro sprint planificado
  destination: z.string().min(1),
});
