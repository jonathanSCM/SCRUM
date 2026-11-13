// Une los dailys viejos (uno por proyecto y día) en uno solo por persona y día (código puro, con tests).

export type LegacyDaily = { projectName: string; yesterday: string; today: string; blockers: string; help: string };
export type MergedDaily = { yesterday: string; today: string; blockers: string; help: string };

const FIELDS = ["yesterday", "today", "blockers", "help"] as const;

// Si solo un proyecto tiene texto en un campo, queda tal cual; si hay varios, cada uno va con el nombre de su proyecto.
export function mergeDailies(rows: LegacyDaily[]): MergedDaily {
  const out: MergedDaily = { yesterday: "", today: "", blockers: "", help: "" };
  for (const f of FIELDS) {
    const filled = rows.filter((r) => r[f].trim());
    if (filled.length === 1) out[f] = filled[0][f].trim();
    else out[f] = filled.map((r) => `${r.projectName}: ${r[f].trim()}`).join("\n").slice(0, 2000);
  }
  return out;
}
