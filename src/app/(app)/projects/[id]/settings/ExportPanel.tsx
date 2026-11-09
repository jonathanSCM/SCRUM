"use client";

import { useState } from "react";
import { buildExportPrompt, type ExportPromptKind } from "@/lib/aiPrompt";
import { useToast } from "@/components/ui/Toaster";
import ImportFromAi from "../../import/ImportFromAi";

// Exportar el proyecto en JSON para darle contexto a una IA (ChatGPT, Claude, Gemini…).
export default function ExportPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [scope, setScope] = useState<"tasks" | "full">("full");
  const [comments, setComments] = useState(5);
  const [anonymize, setAnonymize] = useState(false);
  const [kind, setKind] = useState<ExportPromptKind>("analyze");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const qs = () => `scope=${scope}&comments=${comments}${anonymize ? "&anonymize=1" : ""}`;

  async function fetchJson(): Promise<string | null> {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-json?${qs()}`);
      if (!res.ok) {
        toast.error("No se pudo exportar el proyecto");
        return null;
      }
      const text = await res.text();
      const tokens = Math.round(text.length / 4 / 1000);
      setInfo(`${(text.length / 1024).toFixed(0)} KB · unos ${tokens} mil tokens${tokens > 100 ? ". Es muy grande para ChatGPT gratis: usa el modo «Solo tareas» o menos comentarios." : ""}`);
      return text;
    } catch {
      toast.error("No hay conexión con el servidor");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const text = await fetchJson();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `proyecto-${scope === "tasks" ? "tareas" : "completo"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyWithPrompt() {
    const text = await fetchJson();
    if (!text) return;
    try {
      await navigator.clipboard.writeText([buildExportPrompt(kind, projectId), "```json\n" + text + "\n```"].join("\n\n"));
      toast.success("Prompt y JSON copiados: pégalos en tu asistente");
    } catch {
      toast.error("No se pudo copiar (puede ser muy grande). Usa Descargar JSON y adjúntalo.");
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg font-extrabold text-ink">JSON para IA</h2>
      <h3 className="font-display text-sm font-bold text-ink">Exportar</h3>
      <p className="text-sm text-ink-soft">
        Genera un JSON del proyecto para que una IA tenga todo el contexto: tickets con su jerarquía, estados, responsables y comentarios. Puedes descargarlo o copiarlo junto con un prompt listo.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Qué incluir</label>
          <select className="field" value={scope} onChange={(e) => setScope(e.target.value as "tasks" | "full")}>
            <option value="full">Proyecto completo (tickets, sprints, notas, retros, archivos)</option>
            <option value="tasks">Solo la lista de tareas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Comentarios por ticket</label>
          <select className="field" value={comments} onChange={(e) => setComments(Number(e.target.value))}>
            <option value={0}>Ninguno</option>
            <option value={3}>Los últimos 3</option>
            <option value={5}>Los últimos 5</option>
            <option value={10}>Los últimos 10</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)} /> Anonimizar personas (Persona 1, Persona 2…)
      </label>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Prompt que acompaña al JSON</label>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as ExportPromptKind)}>
          <option value="analyze">Analizar el proyecto y recomendar prioridades</option>
          <option value="update">Actualizar el estado de los tickets según lo que te cuente (devuelve este mismo JSON modificado)</option>
          <option value="newTickets">Proponer tickets nuevos (devuelve JSON para Importar con IA)</option>
          <option value="changes">Proponer cambios a tickets existentes (estado, prioridad, responsable…)</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={busy} onClick={copyWithPrompt}>{busy ? "Preparando…" : "Copiar prompt + JSON"}</button>
        <button className="btn-ghost btn-sm" disabled={busy} onClick={download}>Descargar JSON</button>
      </div>
      {info && <p className="text-xs text-ink-faint">{info}</p>}
      <p className="text-xs text-ink-faint">
        Al volver a pegar el JSON en Proyectos &gt; Importar con IA, los tickets con su «key» se actualizan (estado, prioridad, responsable, puntos, sprint…, solo lo que cambió) y los que no la traen se crean como nuevos. No incluye claves, webhooks, correos ni el contenido de los archivos. Al pegarlo en una IA externa, esa información sale de la app y la recibe ese proveedor.
      </p>
    
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-display text-sm font-bold text-ink">Importar</h3>
        <p className="text-sm text-ink-soft">
          Pega aquí el JSON que te devolvió la IA (o el exportado, ya editado). Los tickets con su «key» se actualizan y los nuevos se crean, siempre dentro de este proyecto.
        </p>
        <ImportFromAi projectId={projectId} />
      </div>
    </section>
  );
}
