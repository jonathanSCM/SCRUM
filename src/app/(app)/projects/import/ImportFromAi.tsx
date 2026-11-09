"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { IMPORT_JSON_PROMPT } from "@/lib/aiPrompt";
import { changesSchema, countIssues, importSchema, splitExport } from "@/lib/scrum/aiImport";
import { useToast } from "@/components/ui/Toaster";

type Result = { project: { id: string; key: string; name: string; created: boolean; url: string }; created: { epics: string[]; stories: string[]; tasks: string[]; notes?: number }; skipped: string[]; warnings: string[] };

// Quita las vallas de código ```json … ``` que suelen agregar los asistentes.
const clean = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

// projectId: dentro de un proyecto, todo lo que se pegue se aplica a ESE proyecto (no se crean proyectos nuevos).
export default function ImportFromAi({ projectId }: { projectId?: string } = {}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [changesResult, setChangesResult] = useState<{ applied: Array<{ key: string; fields: string[] }>; failed: Array<{ key: string; error: string }>; unchanged?: number; projectId: string } | null>(null);

  const check = useMemo(() => {
    if (!text.trim()) return null;
    let json: unknown;
    try {
      json = JSON.parse(clean(text));
    } catch (e) {
      return { ok: false as const, error: `No es un JSON válido (${e instanceof Error ? e.message : "error"}). Pídele al asistente que lo corrija.` };
    }
    // Dentro de un proyecto: el JSON se aplica a ese proyecto (si trae otro project.id, se rechaza).
    if (projectId && json && typeof json === "object" && !Array.isArray(json)) {
      const j = json as Record<string, unknown>;
      const pid = j.project && typeof j.project === "object" ? (j.project as Record<string, unknown>).id : undefined;
      if (typeof pid === "string" && pid !== projectId) return { ok: false as const, error: "Este JSON es de otro proyecto. Impórtalo desde ese proyecto o desde Proyectos > Importar con IA." };
      json = { ...j, project: { ...(j.project && typeof j.project === "object" ? (j.project as Record<string, unknown>) : {}), id: projectId } };
    }
    // La exportación del proyecto (editada): los tickets con "key" se actualizan, los que no la traen se crean.
    const split = splitExport(json);
    if (split) {
      const ch = split.changes.length ? changesSchema.safeParse({ project: { id: split.projectId }, changes: split.changes }) : null;
      if (ch && !ch.success) return { ok: false as const, error: ch.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join(" · ") };
      const imp = split.newImport ? importSchema.safeParse(split.newImport) : null;
      if (imp && !imp.success) return { ok: false as const, error: imp.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join(" · ") };
      return { ok: true as const, kind: "sync" as const, changes: ch?.success ? ch.data : null, newImport: imp?.success ? imp.data : null, existing: split.existing, fresh: split.fresh, projectId: split.projectId, total: split.existing + split.fresh };
    }
    // Lista de cambios sobre tickets existentes: { project: { id }, changes: [...] }
    if (json && typeof json === "object" && "changes" in json) {
      const c = changesSchema.safeParse(json);
      if (!c.success) return { ok: false as const, error: c.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join(" · ") };
      return { ok: true as const, kind: "changes" as const, data: c.data, total: c.data.changes.length };
    }
    const parsed = importSchema.safeParse(json);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join(" · ") };
    return { ok: true as const, kind: "import" as const, data: parsed.data, total: countIssues(parsed.data) };
  }, [text]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(IMPORT_JSON_PROMPT);
      toast.success("Prompt copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function run() {
    if (!check?.ok) return;
    setBusy(true);
    if (check.kind === "sync") {
      let applied: Array<{ key: string; fields: string[] }> = [];
      let failed: Array<{ key: string; error: string }> = [];
      let unchanged = 0;
      if (check.changes) {
        const res = await api<{ applied: typeof applied; failed: typeof failed; unchanged: number }>("/api/ai/changes", "POST", check.changes);
        if (!res.ok) { setBusy(false); return toast.error(res.error); }
        ({ applied, failed, unchanged } = res.data);
      }
      let imported: Result | null = null;
      if (check.newImport) {
        const res = await api<Result>("/api/ai/import", "POST", check.newImport);
        if (!res.ok) toast.error(`Se actualizaron los existentes, pero los nuevos fallaron: ${res.error}`);
        else imported = res.data;
      }
      setBusy(false);
      setResult(imported);
      setChangesResult({ applied, failed, unchanged, projectId: check.projectId });
      setText("");
      return;
    }
    if (check.kind === "changes") {
      const res = await api<{ applied: Array<{ key: string; fields: string[] }>; failed: Array<{ key: string; error: string }> }>("/api/ai/changes", "POST", check.data);
      setBusy(false);
      if (!res.ok) return toast.error(res.error);
      setResult(null);
      setChangesResult({ ...res.data, projectId: check.data.project.id });
      setText("");
      return;
    }
    const res = await api<Result>("/api/ai/import", "POST", check.data);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setChangesResult(null);
    setResult(res.data);
    setText("");
  }

  return (
    <div className="space-y-6">
      {!projectId && (
      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">1. Pídele el JSON a tu asistente (para proyectos nuevos)</h2>
        <p className="text-sm text-ink-soft">Copia este prompt, pégalo en ChatGPT (o el que uses), cuéntale tu proyecto y pídele el JSON. Para <b>editar tickets que ya existen</b>, usa Ajustes del proyecto &gt; Exportar para IA &gt; «Proponer cambios»: la IA te devolverá un JSON de cambios que también se pega aquí.</p>
        <button className="btn-primary btn-sm" onClick={copyPrompt}>Copiar prompt</button>
      </section>
      )}

      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">{projectId ? "Pega aquí el JSON" : "2. Pega el JSON aquí"}</h2>
        <textarea className="field min-h-[14rem] font-mono text-xs" placeholder='{ "project": { "name": "…" }, "epics": [ … ] }' value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        {check && !check.ok && <p className="text-sm font-medium text-danger">{check.error}</p>}
        {check?.ok && check.kind === "sync" && (
          <p className="text-sm text-ink-soft">
            Detecté la <b>exportación de un proyecto</b>: se revisarán <b>{check.existing}</b> tickets que ya existen (solo se aplica lo que cambió: estado, prioridad, responsable, puntos, sprint…) y se crearán <b>{check.fresh}</b> {check.fresh === 1 ? "ticket nuevo" : "tickets nuevos"} (los que no traen «key»).
          </p>
        )}
        {check?.ok && check.kind === "changes" && (
          <p className="text-sm text-ink-soft">Listo para aplicar: <b>{check.total}</b> cambios sobre tickets existentes del proyecto. No crea ni borra tickets.</p>
        )}
        {check?.ok && check.kind === "import" && (
          <p className="text-sm text-ink-soft">
            Listo para importar: proyecto <b>{check.data.project.name ?? "existente"}</b> · {check.total} tickets · {check.data.notes?.length ?? 0} notas. Si ya existe algo con el mismo tipo y título, se omite (no se duplica).
          </p>
        )}
        <button className="btn-primary" disabled={!check?.ok || busy} onClick={run}>{busy ? "Procesando…" : check?.ok && (check.kind === "changes" || check.kind === "sync") ? (check.kind === "sync" ? "Actualizar y agregar" : "Aplicar cambios") : "Importar"}</button>
      </section>

      {changesResult && (
        <section className="space-y-1 rounded-lg border border-moss bg-card-2 p-5 text-sm">
          <p className="font-semibold text-ink">Tickets actualizados: {changesResult.applied.length}{changesResult.unchanged ? ` · sin cambios: ${changesResult.unchanged}` : ""} · con problemas: {changesResult.failed.length}</p>
          {changesResult.applied.length > 0 && <p className="text-xs text-ink-soft">{changesResult.applied.map((a) => `${a.key} (${a.fields.join(", ")})`).join(" · ")}</p>}
          {changesResult.failed.map((f) => <p key={f.key} className="text-xs text-danger">{f.key}: {f.error}</p>)}
          <Link href={`/projects/${changesResult.projectId}/backlog`} className="mt-2 inline-block font-semibold text-rust hover:underline">Abrir el backlog</Link>
        </section>
      )}

      {result && (
        <section className="space-y-1 rounded-lg border border-moss bg-card-2 p-5 text-sm">
          <p className="font-semibold text-ink">
            {result.project.created ? "Proyecto creado" : "Proyecto actualizado"}: {result.project.name} ({result.project.key})
          </p>
          <p className="text-ink-soft">Creado: {result.created.epics.length} épicas, {result.created.stories.length} historias, {result.created.tasks.length} tareas · omitido (ya existía): {result.skipped.length}</p>
          {result.warnings.map((w, i) => <p key={i} className="text-xs text-ink-faint">{w}</p>)}
          <Link href={result.project.url} className="mt-2 inline-block font-semibold text-rust hover:underline">Abrir el proyecto</Link>
        </section>
      )}
    </div>
  );
}
