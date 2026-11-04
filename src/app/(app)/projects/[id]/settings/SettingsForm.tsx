"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Props = {
  isLead: boolean;
  statuses: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  project: {
    id: string;
    key: string;
    name: string;
    description: string;
    deployUrl: string;
    stack: string[];
    statusId: string;
    leadUserId: string;
    readyItems: string[];
    webhookConfigured: boolean;
    webhookHint: string | null;
  };
};

export default function SettingsForm({ isLead, statuses, users, project }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [deployUrl, setDeployUrl] = useState(project.deployUrl);
  const [stack, setStack] = useState(project.stack.join(", "));
  const [statusId, setStatusId] = useState(project.statusId);
  const [leadUserId, setLeadUserId] = useState(project.leadUserId);
  const [saving, setSaving] = useState(false);

  const [readyItems, setReadyItems] = useState<string[]>(project.readyItems);
  const [newReady, setNewReady] = useState("");
  const [savingReady, setSavingReady] = useState(false);

  async function saveReady(items: string[]) {
    setSavingReady(true);
    const res = await api(`/api/projects/${project.id}`, "PATCH", { readyItems: items });
    setSavingReady(false);
    if (!res.ok) return toast.error(res.error);
    setReadyItems(items);
    toast.success("Definition of Ready guardada");
    router.refresh();
  }

  function addReady() {
    const text = newReady.trim();
    if (!text || readyItems.includes(text)) return;
    setNewReady("");
    saveReady([...readyItems, text]);
  }

  const [webhook, setWebhook] = useState("");
  const [configured, setConfigured] = useState(project.webhookConfigured);
  const [hint, setHint] = useState(project.webhookHint);
  const [savingHook, setSavingHook] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await api(`/api/projects/${project.id}`, "PATCH", {
      name,
      description,
      deployUrl: deployUrl.trim() || null,
      stack: stack.split(",").map((s) => s.trim()).filter(Boolean),
      statusId,
      leadUserId: leadUserId || null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Proyecto guardado");
    router.refresh();
  }

  async function saveWebhook(url: string | null) {
    setSavingHook(true);
    const res = await api<{ configured: boolean; hint: string | null }>(`/api/projects/${project.id}/discord-webhook`, "PATCH", { discordWebhookUrl: url ?? "" });
    setSavingHook(false);
    if (!res.ok) return toast.error(res.error);
    setConfigured(res.data.configured);
    setHint(res.data.hint);
    setWebhook("");
    toast.success(res.data.configured ? "Webhook guardado" : "Webhook quitado");
  }

  async function testWebhook() {
    setTesting(true);
    const res = await api(`/api/projects/${project.id}/discord-webhook/test`, "POST", {});
    setTesting(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Mensaje de prueba enviado. Revisá el canal de Discord.");
  }

  async function removeProject() {
    const ok = await confirm(`¿Eliminar «${project.name}» con todos sus tickets, sprints y adjuntos? No se puede deshacer.`, { confirmLabel: "Eliminar proyecto", danger: true });
    if (!ok) return;
    const res = await api(`/api/projects/${project.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    toast.success("Proyecto eliminado");
    router.push("/projects");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <form onSubmit={save} className="space-y-4 border-2 border-ink bg-card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink">Detalles</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Nombre</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Clave</label>
            <input className="field font-mono" value={project.key} disabled title="La clave no se puede cambiar" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Descripción</label>
          <textarea className="field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Estado del proyecto</label>
            <select className="field" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Encargado del proyecto</label>
            <select className="field" value={leadUserId} onChange={(e) => setLeadUserId(e.target.value)}>
              <option value="">Sin encargado</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">URL de despliegue</label>
            <input className="field" type="url" placeholder="https://…" value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Stack (separado por comas)</label>
            <input className="field" placeholder="Next.js, Postgres" value={stack} onChange={(e) => setStack(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving || !name.trim()}>{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </form>

      <section className="space-y-3 border-2 border-ink bg-card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink">Definition of Ready</h2>
        <p className="text-sm text-ink-soft">
          Lo que necesitamos tener antes de empezar a trabajar un ticket (por ejemplo: estructura de datos del cliente, accesos, brief, diseño).
          Cada ticket tiene este checklist y no se puede iniciar un sprint con tickets incompletos, salvo que un líder lo fuerce.
        </p>
        {readyItems.length === 0 && <p className="text-xs text-ink-faint">Todavía no hay ítems: sin ellos, el sprint se puede iniciar sin revisar nada.</p>}
        <ul className="space-y-1.5">
          {readyItems.map((item) => (
            <li key={item} className="flex items-center gap-2 border-2 border-line-strong px-2.5 py-1.5 text-sm text-ink">
              <span className="min-w-0 flex-1 break-words">{item}</span>
              {isLead && (
                <button className="btn-ghost btn-sm text-danger" disabled={savingReady} onClick={() => saveReady(readyItems.filter((i) => i !== item))} aria-label={`Quitar ${item}`}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
        {isLead ? (
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="Ej: Estructura de datos que pasa el cliente"
              value={newReady}
              maxLength={200}
              onChange={(e) => setNewReady(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addReady();
                }
              }}
            />
            <button className="btn-primary" disabled={savingReady || !newReady.trim()} onClick={addReady}>Añadir</button>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">Solo un líder puede cambiar la Definition of Ready.</p>
        )}
      </section>

      <section className="space-y-3 border-2 border-ink bg-card p-5">
        <h2 className="font-display text-lg font-extrabold text-ink">Integraciones · Discord</h2>
        <p className="text-sm text-ink-soft">
          Avisa en un canal cuando se crea un ticket, pasa a Hecho, se asigna o se comenta, y cuando un sprint empieza o termina.
          Cada persona puede cargar su ID de Discord en <b>Mi perfil</b> para recibir la mención.
        </p>
        {isLead ? (
          <>
            <p className="text-xs text-ink-faint">
              {configured ? <>Webhook configurado (termina en <span className="font-mono text-ink">…{hint}</span>).</> : "Todavía no hay webhook configurado."}
            </p>
            <div className="flex flex-wrap gap-2">
              <input className="field min-w-0 flex-1" type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/…" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
              <button className="btn-primary" disabled={savingHook || !webhook.trim()} onClick={() => saveWebhook(webhook.trim())}>Guardar</button>
            </div>
            {configured && (
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" disabled={testing} onClick={testWebhook}>{testing ? "Enviando…" : "Enviar mensaje de prueba"}</button>
                <button className="btn-ghost btn-sm text-danger" disabled={savingHook} onClick={() => saveWebhook(null)}>Quitar webhook</button>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-faint">Solo un líder puede configurar el webhook. {configured ? "Está activo." : "Todavía no está configurado."}</p>
        )}
      </section>

      {isLead && (
        <section className="space-y-3 border-2 border-danger bg-card p-5">
          <h2 className="font-display text-lg font-extrabold text-danger">Zona de peligro</h2>
          <p className="text-sm text-ink-soft">Eliminar el proyecto borra todos sus tickets, sprints, comentarios y adjuntos.</p>
          <button className="btn-danger" onClick={removeProject}>Eliminar proyecto</button>
        </section>
      )}
    </div>
  );
}
