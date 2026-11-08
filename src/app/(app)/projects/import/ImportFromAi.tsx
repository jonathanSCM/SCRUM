"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { IMPORT_JSON_PROMPT } from "@/lib/aiPrompt";
import { changesSchema, countIssues, importSchema } from "@/lib/scrum/aiImport";
import { useToast } from "@/components/ui/Toaster";

type Result = { project: { id: string; key: string; name: string; created: boolean; url: string }; created: { epics: string[]; stories: string[]; tasks: string[]; notes?: number }; skipped: string[]; warnings: string[] };

// Quita las vallas de código ```json … ``` que suelen agregar los asistentes.
const clean = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

export default function ImportFromAi() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [changesResult, setChangesResult] = useState<{ applied: Array<{ key: string; fields: string[] }>; failed: Array<{ key: string; error: string }>; projectId: string } | null>(null);

  const check = useMemo(() => {
    if (!text.trim()) return null;
    let json: unknown;
    try {
      json = JSON.parse(clean(text));
    } catch (e) {
      return { ok: false as const, error: `No es un JSON válido (${e instanceof Error ? e.message : "error"}). Pídele al asistente que lo corrija.` };
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
      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">1. Pídele el JSON a tu asistente (para proyectos nuevos)</h2>
        <p className="text-sm text-ink-soft">Copia este prompt, pégalo en ChatGPT (o el que uses), cuéntale tu proyecto y pídele el JSON. Para <b>editar tickets que ya existen</b>, usa Ajustes del proyecto &gt; Exportar para IA &gt; «Proponer cambios»: la IA te devolverá un JSON de cambios que también se pega aquí.</p>
        <button className="btn-primary btn-sm" onClick={copyPrompt}>Copiar prompt</button>
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">2. Pega el JSON aquí</h2>
        <textarea className="field min-h-[14rem] font-mono text-xs" placeholder='{ "project": { "name": "…" }, "epics": [ … ] }' value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        {check && !check.ok && <p className="text-sm font-medium text-danger">{check.error}</p>}
        {check?.ok && check.kind === "changes" && (
          <p className="text-sm text-ink-soft">Listo para aplicar: <b>{check.total}</b> cambios sobre tickets existentes del proyecto. No crea ni borra tickets.</p>
        )}
        {check?.ok && check.kind === "import" && (
          <p className="text-sm text-ink-soft">
            Listo para importar: proyecto <b>{check.data.project.name ?? "existente"}</b> · {check.total} tickets · {check.data.notes?.length ?? 0} notas. Si ya existe algo con el mismo tipo y título, se omite (no se duplica).
          </p>
        )}
        <button className="btn-primary" disabled={!check?.ok || busy} onClick={run}>{busy ? "Procesando…" : check?.ok && check.kind === "changes" ? "Aplicar cambios" : "Importar"}</button>
      </section>

      {changesResult && (
        <section className="space-y-1 rounded-lg border border-moss bg-card-2 p-5 text-sm">
          <p className="font-semibold text-ink">Cambios aplicados: {changesResult.applied.length} · con problemas: {changesResult.failed.length}</p>
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
