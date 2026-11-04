import { prisma } from "@/lib/prisma";

export { HISTORY_LABEL, describeHistory } from "@/lib/historyText";

export type HistoryInput = {
  projectId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  actor?: { id: string; name: string } | null;
};

// Guarda una entrada del historial. Nunca lanza: el historial es un registro
// auxiliar y no puede romper la acción que lo origina.
export async function logHistory(input: HistoryInput): Promise<void> {
  try {
    await prisma.historyEntry.create({
      data: {
        projectId: input.projectId,
        field: input.field,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        taskId: input.taskId ?? null,
        taskTitle: input.taskTitle ?? null,
        changedById: input.actor?.id ?? null,
        changedByName: input.actor?.name ?? null,
      },
    });
  } catch (err) {
    console.error("[history] no se pudo guardar la entrada:", err);
  }
}
