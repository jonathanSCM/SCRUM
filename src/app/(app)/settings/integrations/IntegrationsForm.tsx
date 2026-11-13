"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toaster";

type Status = { openai: { own: boolean; hint: string | null; active: boolean }; gemini: { own: boolean; hint: string | null; active: boolean }; slackBot: { own: boolean; hint: string | null; active: boolean }; slackWebhook: { own: boolean; hint: string | null; active: boolean } };

export default function IntegrationsForm() {
  const toast = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [gemini, setGemini] = useState("");
  const [openai, setOpenai] = useState("");
  const [slack, setSlack] = useState("");
  const [hook, setHook] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/workspaces/integrations");
    if (r.ok) setSt(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(body: Record<string, string | null>, done: string) {
    const r = await fetch("/api/workspaces/integrations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return toast.error((await r.json().catch(() => ({}))).error || "No se pudo guardar");
    toast.success(done);
    setGemini("");
    setOpenai("");
    setSlack("");
    setHook("");
    load();
  }

  const line = (s: { own: boolean; hint: string | null; active: boolean }) =>
    s.own ? `Clave propia guardada (termina en …${s.hint}).` : s.active ? "Usando la clave del servidor (equipo original)." : "Sin configurar.";

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">OpenAI (transcripción de las reuniones de Meet)</h2>
        <p className="text-xs text-ink-soft">{st ? line(st.openai) : "Cargando…"} El audio que graba la extensión se transcribe con tu cuenta de OpenAI y luego se borra. La clave se crea en platform.openai.com (API keys).</p>
        <div className="flex flex-wrap gap-2">
          <input className="field min-w-0 flex-1 font-mono" type="password" autoComplete="off" placeholder="Pega la clave de OpenAI (sk-…)" value={openai} onChange={(e) => setOpenai(e.target.value)} />
          <button className="btn-primary" disabled={!openai} onClick={() => save({ openaiKey: openai }, "Clave de OpenAI guardada")}>Guardar</button>
          {st?.openai.own && <button className="btn-ghost" onClick={() => save({ openaiKey: null }, "Clave de OpenAI borrada")}>Borrar</button>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Gemini (sugerencias de IA en el PDF del sprint)</h2>
        <p className="text-xs text-ink-soft">{st ? line(st.gemini) : "Cargando…"} La consigues en Google AI Studio.</p>
        <div className="flex flex-wrap gap-2">
          <input className="field min-w-0 flex-1 font-mono" type="password" autoComplete="off" placeholder="Pega la clave de Gemini" value={gemini} onChange={(e) => setGemini(e.target.value)} />
          <button className="btn-primary" disabled={!gemini} onClick={() => save({ geminiKey: gemini }, "Clave de Gemini guardada")}>Guardar</button>
          {st?.gemini.own && <button className="btn-ghost" onClick={() => save({ geminiKey: null }, "Clave de Gemini borrada")}>Borrar</button>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Canal de Slack del equipo (comandos /noti y /reunion del chat)</h2>
        <p className="text-xs text-ink-soft">{st ? line(st.slackWebhook) : "Cargando…"} Es un Incoming Webhook (https://hooks.slack.com/services/…) del canal donde quieres que lleguen los avisos del equipo.</p>
        <div className="flex flex-wrap gap-2">
          <input className="field min-w-0 flex-1 font-mono" type="password" autoComplete="off" placeholder="https://hooks.slack.com/services/…" value={hook} onChange={(e) => setHook(e.target.value)} />
          <button className="btn-primary" disabled={!hook} onClick={() => save({ slackWebhook: hook }, "Webhook guardado")}>Guardar</button>
          {st?.slackWebhook.own && <button className="btn-ghost" onClick={() => save({ slackWebhook: null }, "Webhook borrado")}>Borrar</button>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Bot de Slack (adjuntar el PDF al canal)</h2>
        <p className="text-xs text-ink-soft">{st ? line(st.slackBot) : "Cargando…"} Token del bot (empieza con xoxb-), con permisos files:write y chat:write.</p>
        <div className="flex flex-wrap gap-2">
          <input className="field min-w-0 flex-1 font-mono" type="password" autoComplete="off" placeholder="xoxb-…" value={slack} onChange={(e) => setSlack(e.target.value)} />
          <button className="btn-primary" disabled={!slack} onClick={() => save({ slackBotToken: slack }, "Token de Slack guardado")}>Guardar</button>
          {st?.slackBot.own && <button className="btn-ghost" onClick={() => save({ slackBotToken: null }, "Token de Slack borrado")}>Borrar</button>}
        </div>
      </section>
    </div>
  );
}
