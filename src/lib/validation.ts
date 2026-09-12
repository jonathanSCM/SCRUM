import { NextResponse } from "next/server";
import { z } from "zod";

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): { data: T } | { error: NextResponse } {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Datos inválidos";
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data };
}

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  role: z.enum(["LEAD", "MEMBER"]).optional(),
});

export const createSprintSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(100),
  startDate: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha de inicio inválida"),
  endDate: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha de fin inválida"),
});

export const assignSprintSchema = z.object({
  sprintId: z.string().nullable(),
});

const syncProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  repoUrl: z.string().nullable().optional(),
  deployUrl: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  stack: z.string().optional(),
  statusId: z.string().min(1),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
});

const syncTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  type: z.string(),
  priority: z.string(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  moduleName: z.string().nullable().optional(),
});

const syncStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string(),
  order: z.number().int(),
});

const syncDocumentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  filename: z.string(),
  fileType: z.string(),
  docType: z.string(),
  uploadedAt: z.string(),
});

const syncHistorySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  field: z.string(),
  oldValue: z.string().nullable().optional(),
  newValue: z.string().nullable().optional(),
  changedAt: z.string(),
  changedByName: z.string().nullable().optional(),
  taskTitle: z.string().nullable().optional(),
});

export const syncUpsertSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project"), data: syncProjectSchema }),
  z.object({ type: z.literal("task"), data: syncTaskSchema }),
  z.object({ type: z.literal("status"), data: syncStatusSchema }),
  z.object({ type: z.literal("document"), data: syncDocumentSchema }),
  z.object({ type: z.literal("history"), data: syncHistorySchema }),
]);

export const syncDeleteSchema = z.object({
  type: z.enum(["project", "task", "status", "document"]),
  id: z.string().min(1),
});

export const updateProjectSchema = z.object({
  statusId: z.string().min(1).optional(),
  assigneeId: z.string().nullable().optional(),
  description: z.string().max(5000).optional(),
  repoUrl: z.string().trim().max(500).nullable().optional(),
  deployUrl: z.string().trim().max(500).nullable().optional(),
  language: z.string().trim().max(100).nullable().optional(),
  stack: z.array(z.string()).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  description: z.string().trim().max(5000).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Título requerido").max(300),
  description: z.string().trim().max(5000).optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().optional(),
});

export const updateTaskSchema = z.object({
  type: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});
