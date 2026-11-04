import type { PrismaClient } from "@prisma/client";
import { DEFAULT_PROJECT_STATUSES } from "../src/lib/scrum/constants";
import { suggestProjectKey } from "../src/lib/scrum/issueKey";
import { RANK_STEP } from "../src/lib/scrum/rank";
import { isLegacyType, legacyTypeToStatus, matchUserByName, sprintStateFromDates } from "../src/lib/scrum/legacyMap";

// Convierte los datos de la v1 (sincronizados desde el panel interno) al modelo
// Scrum. Corre en cada arranque del contenedor, así que TIENE que ser
// idempotente: cada paso solo toca filas que todavía no se convirtieron.

export type MigrationReport = Record<string, number>;

export async function ensureDefaultStatuses(prisma: PrismaClient, report: MigrationReport) {
  const count = await prisma.statusOption.count();
  if (count > 0) return;
  for (const s of DEFAULT_PROJECT_STATUSES) await prisma.statusOption.create({ data: { ...s } });
  report.statusesCreated = DEFAULT_PROJECT_STATUSES.length;
}

async function migrateProjects(prisma: PrismaClient, report: MigrationReport) {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const all = await prisma.project.findMany({ select: { id: true, name: true, key: true, leadUserId: true, assigneeName: true } });
  const taken = new Set(all.map((p) => p.key).filter((k): k is string => !!k));

  for (const project of all) {
    const data: { key?: string; leadUserId?: string } = {};
    if (!project.key) {
      const key = suggestProjectKey(project.name, taken);
      taken.add(key);
      data.key = key;
      report.projectKeys = (report.projectKeys ?? 0) + 1;
    }
    if (!project.leadUserId) {
      const match = matchUserByName(project.assigneeName, users);
      if (match) {
        data.leadUserId = match.id;
        report.projectLeads = (report.projectLeads ?? 0) + 1;
      }
    }
    if (Object.keys(data).length > 0) await prisma.project.update({ where: { id: project.id }, data });
  }
}

async function migrateTasks(prisma: PrismaClient, report: MigrationReport) {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const projects = await prisma.project.findMany({ select: { id: true, taskSeq: true } });

  for (const project of projects) {
    // 1) Número de ticket y rank para los que todavía no tienen.
    const unnumbered = await prisma.task.findMany({
      where: { projectId: project.id, number: null },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true, updatedAt: true },
    });
    if (unnumbered.length > 0) {
      const base = Math.max(
        project.taskSeq,
        (await prisma.task.aggregate({ where: { projectId: project.id }, _max: { number: true } }))._max.number ?? 0
      );
      let seq = base;
      for (const t of unnumbered) {
        seq += 1;
        await prisma.task.update({ where: { id: t.id }, data: { number: seq, rank: seq * RANK_STEP, updatedAt: t.updatedAt } });
      }
      await prisma.project.update({ where: { id: project.id }, data: { taskSeq: seq } });
      report.taskNumbers = (report.taskNumbers ?? 0) + unnumbered.length;
    }
  }

  // 2) Falso estado viejo (CAMBIO_*) -> estado real del flujo.
  const legacy = await prisma.task.findMany({ where: { type: { startsWith: "CAMBIO_" } } });
  for (const t of legacy) {
    if (!isLegacyType(t.type)) continue;
    const status = legacyTypeToStatus(t.type);
    await prisma.task.update({
      where: { id: t.id },
      data: {
        status,
        issueType: "TASK",
        type: "",
        completedAt: status === "DONE" ? t.updatedAt : null,
        createdAt: t.updatedAt,
        updatedAt: t.updatedAt,
      },
    });
    report.taskStatuses = (report.taskStatuses ?? 0) + 1;
  }

  // 3) Encargado: reconectar por nombre con un usuario local.
  const unassigned = await prisma.task.findMany({
    where: { assigneeUserId: null, assigneeName: { not: null } },
    select: { id: true, assigneeName: true, updatedAt: true },
  });
  for (const t of unassigned) {
    const match = matchUserByName(t.assigneeName, users);
    if (!match) continue;
    await prisma.task.update({ where: { id: t.id }, data: { assigneeUserId: match.id, updatedAt: t.updatedAt } });
    report.taskAssignees = (report.taskAssignees ?? 0) + 1;
  }
}

// Los sprints viejos eran globales (mezclaban tickets de varios proyectos). Cada
// sprint se queda con el primer proyecto que tiene tickets en él y se crea una
// copia (mismo nombre y fechas) para cada uno de los demás.
async function migrateSprints(prisma: PrismaClient, report: MigrationReport) {
  const orphans = await prisma.sprint.findMany({ where: { projectId: null }, include: { tasks: { select: { id: true, projectId: true, status: true } } } });

  for (const sprint of orphans) {
    if (sprint.tasks.length === 0) {
      await prisma.sprint.delete({ where: { id: sprint.id } });
      report.sprintsDropped = (report.sprintsDropped ?? 0) + 1;
      continue;
    }

    const byProject = new Map<string, typeof sprint.tasks>();
    for (const t of sprint.tasks) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);

    const state = sprintStateFromDates(sprint.startDate, sprint.endDate);
    const closed = state === "COMPLETED";
    const common = {
      state,
      startedAt: state === "PLANNED" ? null : sprint.startDate,
      completedAt: closed ? sprint.endDate : null,
    };
    const snapshot = (tasks: typeof sprint.tasks) => ({
      committedCount: tasks.length,
      completedCount: tasks.filter((t) => t.status === "DONE").length,
    });

    let first = true;
    for (const [projectId, tasks] of byProject) {
      if (first) {
        await prisma.sprint.update({ where: { id: sprint.id }, data: { projectId, ...common, ...snapshot(tasks) } });
        first = false;
      } else {
        const copy = await prisma.sprint.create({
          data: { name: sprint.name, goal: sprint.goal, startDate: sprint.startDate, endDate: sprint.endDate, projectId, ...common, ...snapshot(tasks) },
        });
        await prisma.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { sprintId: copy.id } });
        report.sprintCopies = (report.sprintCopies ?? 0) + 1;
      }
    }
    report.sprintsScoped = (report.sprintsScoped ?? 0) + 1;
  }

  // Un solo sprint activo por proyecto: si los viejos se solapaban, queda el
  // que empezó más tarde y el resto pasa a completado.
  const active = await prisma.sprint.findMany({ where: { state: "ACTIVE", projectId: { not: null } }, orderBy: { startDate: "desc" } });
  const seen = new Set<string>();
  for (const s of active) {
    if (!s.projectId) continue;
    if (!seen.has(s.projectId)) {
      seen.add(s.projectId);
      continue;
    }
    await prisma.sprint.update({ where: { id: s.id }, data: { state: "COMPLETED", completedAt: s.endDate ?? new Date() } });
    report.sprintsClosed = (report.sprintsClosed ?? 0) + 1;
  }
}

export async function migrateLegacy(prisma: PrismaClient): Promise<MigrationReport> {
  const report: MigrationReport = {};
  await ensureDefaultStatuses(prisma, report);
  await migrateProjects(prisma, report);
  await migrateTasks(prisma, report);
  await migrateSprints(prisma, report);
  return report;
}
