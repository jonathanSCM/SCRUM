import { PrismaClient } from "@prisma/client";

// Los «grupos de tareas» se retiraron de la aplicación. Este script (de una sola vez) limpia los que hayan quedado
// en la base de datos. NO borra nada si no se lo pides, y nunca borra tareas sin que lo indiques:
//
//   npx tsx prisma/remove-groups.ts                  # solo muestra los grupos que hay y cuántas tareas tienen
//   npx tsx prisma/remove-groups.ts --apply          # borra los grupos VACÍOS (p. ej. los ya convertidos en proyecto)
//   npx tsx prisma/remove-groups.ts --apply --delete-tasks   # además borra los grupos con tareas (¡y sus tareas!)
//
// Mientras existan, los grupos quedan ocultos en toda la aplicación (no aparecen como proyectos).
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const DELETE_TASKS = process.argv.includes("--delete-tasks");

async function main() {
  const groups = await prisma.project.findMany({
    where: { kind: "GROUP" },
    select: { id: true, name: true, isPrivate: true, archivedAt: true, convertedToId: true, workspace: { select: { name: true } }, _count: { select: { tasks: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (groups.length === 0) return console.log("No hay grupos de tareas en la base de datos. Nada que limpiar.");
  console.log(`${groups.length} grupos de tareas. ${APPLY ? "Aplicando…" : "(Vista previa: no se borra nada. Usa --apply para borrar los vacíos.)"}\n`);
  let removed = 0;
  let kept = 0;
  for (const g of groups) {
    const tasks = g._count.tasks;
    const label = `«${g.name}» (equipo ${g.workspace?.name ?? "?"}${g.isPrivate ? ", privado" : ""}${g.convertedToId ? ", ya convertido en proyecto" : g.archivedAt ? ", archivado" : ""}) — ${tasks} ${tasks === 1 ? "tarea" : "tareas"}`;
    if (tasks > 0 && !DELETE_TASKS) {
      kept++;
      console.log(`  ⚠  ${label}: SE CONSERVA (tiene tareas; usa --delete-tasks para borrarlo con ellas)`);
      continue;
    }
    console.log(`  ✓  ${label}: ${APPLY ? "borrado" : "se borraría"}`);
    if (APPLY) await prisma.project.delete({ where: { id: g.id } });
    removed++;
  }
  console.log(`\n${APPLY ? "Borrados" : "Se borrarían"}: ${removed}. Conservados: ${kept}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
