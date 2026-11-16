import { PrismaClient } from "@prisma/client";
import { fetchDriveTitle } from "../src/lib/scrum/driveFetch";
import { isDriveUrl } from "../src/lib/scrum/driveTitle";
import { friendlyTitle } from "../src/lib/scrum/resources";

// Una sola vez: pone el nombre real a los enlaces de Google Drive que se guardaron con el nombre genérico
// ("Documento de Google", "Archivo de Google Drive"…). NO toca los que alguien renombró a mano.
//
//   npx tsx prisma/rename-drive-links.ts            # solo muestra qué cambiaría (no escribe nada)
//   npx tsx prisma/rename-drive-links.ts --apply    # aplica los cambios
//
// Solo se obtiene el nombre de los documentos con acceso «cualquiera con el enlace»; los privados se dejan como están.
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { table: "tarjeta" | "archivos del proyecto" | "reunión"; id: string; url: string; current: string };

async function candidates(): Promise<Row[]> {
  const rows: Row[] = [];
  const cards = await prisma.fileCardItem.findMany({ where: { kind: "LINK", url: { not: null } }, select: { id: true, url: true, title: true } });
  for (const r of cards) if (r.url && isDriveUrl(r.url) && r.title === friendlyTitle(r.url)) rows.push({ table: "tarjeta", id: r.id, url: r.url, current: r.title });
  const res = await prisma.projectResource.findMany({ where: { kind: "LINK", url: { not: null } }, select: { id: true, url: true, title: true } });
  for (const r of res) if (r.url && isDriveUrl(r.url) && r.title === friendlyTitle(r.url)) rows.push({ table: "archivos del proyecto", id: r.id, url: r.url, current: r.title });
  const meet = await prisma.meetingFile.findMany({ where: { kind: "LINK", url: { not: null } }, select: { id: true, url: true, filename: true } });
  for (const r of meet) if (r.url && isDriveUrl(r.url) && r.filename === new URL(r.url).hostname) rows.push({ table: "reunión", id: r.id, url: r.url, current: r.filename });
  return rows;
}

async function main() {
  const rows = await candidates();
  console.log(`${rows.length} enlaces de Drive con nombre genérico. ${APPLY ? "Aplicando…" : "(Vista previa: no se escribe nada. Usa --apply para aplicar.)"}\n`);
  let renamed = 0;
  let privates = 0;
  const cache = new Map<string, string | null>(); // el mismo enlace puede estar en varias tarjetas
  for (const r of rows) {
    if (!cache.has(r.url)) {
      cache.set(r.url, await fetchDriveTitle(r.url));
      await sleep(700); // sin ir muy rápido para que Google no bloquee
    }
    const title = cache.get(r.url);
    if (!title) {
      privates++;
      console.log(`  —  [${r.table}] «${r.current}» no se pudo leer (privado o sin acceso público)`);
      continue;
    }
    console.log(`  ✓  [${r.table}] «${r.current}» → «${title}»`);
    if (APPLY) {
      if (r.table === "tarjeta") await prisma.fileCardItem.update({ where: { id: r.id }, data: { title } });
      else if (r.table === "archivos del proyecto") await prisma.projectResource.update({ where: { id: r.id }, data: { title } });
      else await prisma.meetingFile.update({ where: { id: r.id }, data: { filename: title } });
    }
    renamed++;
  }
  console.log(`\n${APPLY ? "Renombrados" : "Se renombrarían"}: ${renamed}. Sin poder leer: ${privates}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
