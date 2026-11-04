// Conversión de los datos viejos (v1, sincronizados desde el panel interno) al
// modelo Scrum. Funciones puras: la migración de verdad vive en
// prisma/legacy-migrate.ts y las usa.

import type { IssueStatus } from "./constants";

const LEGACY_STATUS: Record<string, IssueStatus> = {
  CAMBIO_REALIZADO: "DONE",
  CAMBIO_A_REALIZAR: "TODO",
  CAMBIO_NECESARIO: "TODO",
  CAMBIO_PENDIENTE: "TODO",
};

export function isLegacyType(type: string | null | undefined): boolean {
  return !!type && type in LEGACY_STATUS;
}

export function legacyTypeToStatus(type: string): IssueStatus {
  return LEGACY_STATUS[type] ?? "TODO";
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Los ids de encargado viejos eran del panel interno: lo único que se puede
// usar para reconectarlos con un usuario local es el nombre.
export function matchUserByName<T extends { id: string; name: string }>(name: string | null | undefined, users: T[]): T | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  return users.find((u) => norm(u.name) === target) ?? null;
}

export function sprintStateFromDates(
  startDate: Date | null,
  endDate: Date | null,
  now: Date = new Date()
): "PLANNED" | "ACTIVE" | "COMPLETED" {
  if (startDate && endDate) {
    if (now.getTime() > endDate.getTime()) return "COMPLETED";
    if (now.getTime() >= startDate.getTime()) return "ACTIVE";
  }
  return "PLANNED";
}
