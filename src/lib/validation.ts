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
  statusId: z.string().min(1),
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
  assigneeName: z.string().nullable().optional(),
  moduleName: z.string().nullable().optional(),
});

const syncStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string(),
  order: z.number().int(),
});

export const syncUpsertSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project"), data: syncProjectSchema }),
  z.object({ type: z.literal("task"), data: syncTaskSchema }),
  z.object({ type: z.literal("status"), data: syncStatusSchema }),
]);

export const syncDeleteSchema = z.object({
  type: z.enum(["project", "task", "status"]),
  id: z.string().min(1),
});
