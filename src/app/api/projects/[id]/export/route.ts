import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { parseLabels } from "@/lib/scrum/labels";
import { ISSUE_TYPE_META, PRIORITY_META, STATUS_META, type IssueStatus, type IssueType, type Priority } from "@/lib/scrum/constants";

export const runtime = "nodejs";

// Exporta los tickets del proyecto a Excel (.xlsx).
// Filtros opcionales: ?mine=1 (solo los míos), ?sprint=<id>|backlog, ?status=<TODO|...>.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const url = new URL(req.url);

  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, key: true, name: true } });
    if (!project) return notFound("Proyecto no encontrado");

    const sprint = url.searchParams.get("sprint");
    const status = url.searchParams.get("status");
    const mine = url.searchParams.get("mine") === "1";

    const tasks = await prisma.task.findMany({
      where: {
        projectId: id,
        ...(mine ? { assigneeUserId: auth.user.id } : {}),
        ...(sprint === "backlog" ? { sprintId: null, issueType: { not: "EPIC" } } : sprint ? { sprintId: sprint } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ number: "asc" }],
      include: {
        assignee: { select: { name: true } },
        reporter: { select: { name: true } },
        epic: { select: { number: true, title: true } },
        sprint: { select: { name: true } },
      },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tickets");
    ws.columns = [
      { header: "Clave", key: "key", width: 12 },
      { header: "Tipo", key: "type", width: 11 },
      { header: "Título", key: "title", width: 50 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Prioridad", key: "priority", width: 11 },
      { header: "Puntos", key: "points", width: 9 },
      { header: "Responsable", key: "assignee", width: 22 },
      { header: "Sprint", key: "sprint", width: 20 },
      { header: "Épica", key: "epic", width: 28 },
      { header: "Etiquetas", key: "labels", width: 22 },
      { header: "Fecha límite", key: "due", width: 13 },
      { header: "Creado", key: "created", width: 13 },
      { header: "Completado", key: "completed", width: 13 },
      { header: "Reportado por", key: "reporter", width: 22 },
      { header: "Descripción", key: "description", width: 60 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const t of tasks) {
      ws.addRow({
        key: formatIssueKey(project.key, t.number),
        type: ISSUE_TYPE_META[t.issueType as IssueType]?.label ?? t.issueType,
        title: t.title,
        status: t.issueType === "EPIC" ? "" : STATUS_META[t.status as IssueStatus]?.label ?? t.status,
        priority: PRIORITY_META[t.priority as Priority]?.label ?? t.priority,
        points: t.storyPoints ?? "",
        assignee: t.assignee?.name ?? "",
        sprint: t.sprint?.name ?? (t.issueType === "EPIC" ? "" : "Backlog"),
        epic: t.epic ? `${formatIssueKey(project.key, t.epic.number)} ${t.epic.title}` : "",
        labels: parseLabels(t.labels).join(", "),
        due: t.dueDate ?? "",
        created: t.createdAt,
        completed: t.completedAt ?? "",
        reporter: t.reporter?.name ?? "",
        description: t.description,
      });
    }
    for (const col of ["due", "created", "completed"]) ws.getColumn(col).numFmt = "dd/mm/yyyy";
    ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };

    const buffer = await wb.xlsx.writeBuffer();
    const safe = (project.key ?? project.name).replace(/[^\w-]+/g, "_");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}-tickets${mine ? "-mios" : ""}-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
