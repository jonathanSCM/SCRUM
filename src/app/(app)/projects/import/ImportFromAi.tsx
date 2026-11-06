"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { IMPORT_JSON_PROMPT } from "@/lib/aiPrompt";
import { countIssues, importSchema } from "@/lib/scrum/aiImport";
import { useToast } from "@/components/ui/Toaster";

type Result = { project: { id: string; key: string; name: string; created: boolean; url: string }; created: { epics: string[]; stories: string[]; tasks: string[]; notes?: number }; skipped: string[]; warnings: string[] };

// Quita las vallas de código ```json … ``` que suelen agregar los asistentes.
const clean = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

export default function ImportFromAi() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const check = useMemo(() => {
    if (!text.trim()) return null;
    let json: unknown;
    try {
      json = JSON.parse(clean(text));
    } catch (e) {
      return { ok: false as const, error: `No es un JSON válido (${e instanceof Error ? e.message : "error"}). Pídele al asistente que lo corrija.` };
    }
    const parsed = importSchema.safeParse(json);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join(" · ") };
    return { ok: true as const, data: parsed.data, total: countIssues(parsed.data) };
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
    const res = await api<Result>("/api/ai/import", "POST", check.data);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setResult(res.data);
    setText("");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">1. Pídele el JSON a tu asistente</h2>
        <p className="text-sm text-ink-soft">Copia este prompt, pégalo en ChatGPT (o el que uses), cuéntale tu proyecto y pídele el JSON.</p>
        <button className="btn-primary btn-sm" onClick={copyPrompt}>Copiar prompt</button>
      </section>

      <section className="space-y-2 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold text-ink">2. Pega el JSON aquí</h2>
        <textarea className="field min-h-[14rem] font-mono text-xs" placeholder='{ "project": { "name": "…" }, "epics": [ … ] }' value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        {check && !check.ok && <p className="text-sm font-medium text-danger">{check.error}</p>}
        {check?.ok && (
          <p className="text-sm text-ink-soft">
            Listo para importar: proyecto <b>{check.data.project.name ?? "existente"}</b> · {check.total} tickets · {check.data.notes?.length ?? 0} notas. Si ya existe algo con el mismo tipo y título, se omite (no se duplica).
          </p>
        )}
        <button className="btn-primary" disabled={!check?.ok || busy} onClick={run}>{busy ? "Importando…" : "Importar"}</button>
      </section>

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
