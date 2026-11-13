"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { cn, timeAgo } from "@/lib/ui";
import {
  PLANNING_TEMPLATE,
  REVIEW_TEMPLATE,
  RETRO_COLUMN_META,
  type RetroColumn,
  type ReviewSummary,
} from "@/lib/scrum/ceremonies";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type SprintLite = { id: string; name: string; state: string };
type RetroRow = { id: string; column: string; body: string; ticketKey: string | null; author: { id: string; name: string } | null };
type Acta = { id: string; title: string; body: string; kind: string; createdAt: string; author: string | null };
type Contact = { id: string; name: string; role: string; contact: string; notes: string };

type Props = {
  projectId: string;
  initialTab: string;
  sprints: SprintLite[];
  selectedSprintId: string | null;
  currentUserId: string;
  isLead: boolean;
  review: ReviewSummary;
  retro: RetroRow[];
  actas: Acta[];
  contacts: Contact[];
};

const TABS = [
  { id: "planning", label: "Planning" },
  { id: "review", label: "Review" },
  { id: "retro", label: "Retro" },
  { id: "contacts", label: "Ayuda y contactos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function CeremoniesView(props: Props) {
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === props.initialTab) ? (props.initialTab as TabId) : "planning");
  const router = useRouter();
  const pathname = usePathname();
  const needsSprint = tab === "review" || tab === "retro";

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-faint">El daily ahora es general del equipo: está en <Link href="/daily" className="font-semibold text-rust hover:underline">Daily</Link>.</p>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("btn-ghost btn-sm", tab === t.id && "border-rust bg-card-2 text-rust")}>
            {t.label}
          </button>
        ))}
        {needsSprint && props.sprints.length > 0 && (
          <select
            className="field-sm ml-auto"
            aria-label="Sprint"
            value={props.selectedSprintId ?? ""}
            onChange={(e) => router.push(`${pathname}?tab=${tab}&sprint=${e.target.value}`)}
          >
            {props.sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.state === "ACTIVE" ? " (activo)" : s.state === "COMPLETED" ? " (completado)" : ""}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "planning" && <ActasPanel projectId={props.projectId} kind="PLANNING" actas={props.actas} template={PLANNING_TEMPLATE} hint="Antes de empezar: objetivo, capacidad y tickets comprometidos. Revisá la Definition of Ready desde el Backlog." />}
      {tab === "review" && (
        <>
          <ReviewSummaryPanel review={props.review} hasSprint={!!props.selectedSprintId} />
          <ActasPanel projectId={props.projectId} kind="REVIEW" actas={props.actas} template={REVIEW_TEMPLATE} hint="Al cerrar el sprint: qué se presentó al Product Owner y qué feedback hubo." />
        </>
      )}
      {tab === "retro" && <RetroPanel {...props} />}
      {tab === "contacts" && <ContactsPanel projectId={props.projectId} contacts={props.contacts} />}
    </div>
  );
}

// ---------------- Planning / Review (actas) ----------------

function ActasPanel({ projectId, kind, actas, template, hint }: { projectId: string; kind: "PLANNING" | "REVIEW"; actas: Acta[]; template: string; hint: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const label = kind === "PLANNING" ? "Planning" : "Review";
  const list = actas.filter((a) => a.kind === kind);

  async function create() {
    setBusy(true);
    const title = `${label} · ${new Date().toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`;
    const res = await api(`/api/projects/${projectId}/notes`, "POST", { title, body: template, kind });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Acta creada. Completala desde la pestaña Notas.");
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-soft">{hint}</p>
        <button className="btn-primary btn-sm" disabled={busy} onClick={create}>Crear acta de {label.toLowerCase()}</button>
      </div>
      {list.length === 0 ? (
        <p className="border border-dashed border-line-strong px-4 py-6 text-center text-xs text-ink-faint rounded-md">Todavía no hay actas de {label.toLowerCase()}.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="border border-line bg-card rounded-lg">
              <details>
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <b className="text-ink">{a.title}</b>
                  <span className="ml-auto text-xs text-ink-faint">{a.author ?? "—"} · {timeAgo(a.createdAt)}</span>
                </summary>
                <p className="whitespace-pre-wrap break-words border-t border-line-strong px-3 py-3 text-sm text-ink-soft">{a.body || "Sin contenido."}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewSummaryPanel({ review, hasSprint }: { review: ReviewSummary; hasSprint: boolean }) {
  if (!hasSprint) return <EmptyState title="Todavía no hay sprints" hint="Cuando haya un sprint, acá vas a ver lo que se entregó." />;
  return (
    <section className="border border-line bg-card rounded-lg overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-strong bg-card-2 px-4 py-2.5">
        <h2 className="font-display text-base font-extrabold text-ink">Qué se entregó</h2>
        <span className="text-xs text-ink-soft">{review.completed}/{review.committed} tickets · {review.completedPoints}/{review.committedPoints} pts</span>
      </header>
      <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-bold text-moss-ink">Hecho ({review.done.length})</h3>
          {review.done.length === 0 ? <p className="text-xs text-ink-faint">Nada todavía.</p> : (
            <ul className="space-y-1 text-sm text-ink-soft">{review.done.map((t) => <li key={t.key}><span className="font-mono text-xs text-ink-faint">{t.key}</span> {t.title}</li>)}</ul>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-bold text-warn">Sin terminar ({review.notDone.length})</h3>
          {review.notDone.length === 0 ? <p className="text-xs text-ink-faint">Todo terminado</p> : (
            <ul className="space-y-1 text-sm text-ink-soft">{review.notDone.map((t) => <li key={t.key}><span className="font-mono text-xs text-ink-faint">{t.key}</span> {t.title}</li>)}</ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------- Retro ----------------

function RetroPanel({ projectId, selectedSprintId, retro, currentUserId, isLead, sprints }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!selectedSprintId) return <EmptyState title="Todavía no hay sprints" hint="La retro se hace sobre un sprint." />;
  const sprintName = sprints.find((s) => s.id === selectedSprintId)?.name ?? "";

  async function add(column: RetroColumn) {
    const body = (drafts[column] ?? "").trim();
    if (!body) return;
    const res = await api(`/api/projects/${projectId}/retro`, "POST", { sprintId: selectedSprintId, column, body });
    if (!res.ok) return toast.error(res.error);
    setDrafts((d) => ({ ...d, [column]: "" }));
    router.refresh();
  }

  async function remove(item: RetroRow) {
    if (!(await confirm("¿Borrar este punto?", { confirmLabel: "Borrar", danger: true }))) return;
    const res = await api(`/api/retro/${item.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  async function toTicket(item: RetroRow) {
    const res = await api<{ key: string }>(`/api/retro/${item.id}/ticket`, "POST", {});
    if (!res.ok) return toast.error(res.error);
    toast.success(`Ticket ${res.data.key} creado en el backlog`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(Object.keys(RETRO_COLUMN_META) as RetroColumn[]).map((col) => {
        const items = retro.filter((r) => r.column === col);
        return (
          <section key={col} className="flex flex-col border border-line bg-card rounded-lg">
            <header className="border-b border-line-strong bg-card-2 px-3 py-2">
              <h2 className="font-display text-sm font-extrabold text-ink">{RETRO_COLUMN_META[col].label} <span className="font-mono text-ink-faint">({items.length})</span></h2>
              <p className="text-[11px] text-ink-faint">{RETRO_COLUMN_META[col].hint} · {sprintName}</p>
            </header>
            <ul className="flex-1 space-y-2 p-3">
              {items.map((it) => (
                <li key={it.id} className="border border-line-strong p-2 text-sm rounded-md">
                  <p className="whitespace-pre-wrap break-words text-ink">{it.body}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                    {it.author?.name ?? "—"}
                    {it.ticketKey && <span className="font-mono text-moss-ink">→ {it.ticketKey}</span>}
                    {col === "ACTION" && !it.ticketKey && <button className="text-ink-soft hover:text-ink" onClick={() => toTicket(it)}>Convertir en ticket</button>}
                    {(it.author?.id === currentUserId || isLead) && <button className="ml-auto hover:text-danger" onClick={() => remove(it)}>borrar</button>}
                  </p>
                </li>
              ))}
              {items.length === 0 && <li className="text-center text-xs text-ink-faint">Sin puntos todavía.</li>}
            </ul>
            <div className="flex gap-2 border-t border-line-strong p-2">
              <input
                className="field-sm min-w-0 flex-1"
                placeholder="Agregar…"
                maxLength={500}
                value={drafts[col] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [col]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && add(col)}
              />
              <button className="btn-primary btn-sm" disabled={!(drafts[col] ?? "").trim()} onClick={() => add(col)}>+</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------- Ayuda y contactos ----------------

function ContactsPanel({ projectId, contacts }: { projectId: string; contacts: Contact[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", role: "", contact: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api(`/api/projects/${projectId}/contacts`, "POST", form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setForm({ name: "", role: "", contact: "", notes: "" });
    router.refresh();
  }

  async function remove(c: Contact) {
    if (!(await confirm(`¿Quitar a ${c.name}?`, { confirmLabel: "Quitar", danger: true }))) return;
    const res = await api(`/api/contacts/${c.id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-2">
        {contacts.length === 0 ? (
          <EmptyState title="Sin contactos todavía" hint="Anotá a quién acudir en este proyecto: el contacto del cliente, quién sabe de la base de datos, quién da los accesos." />
        ) : (
          contacts.map((c) => (
            <article key={c.id} className="flex items-start gap-3 border border-line bg-card px-3 py-2.5 rounded-lg">
              <Avatar name={c.name} size={28} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-ink"><b>{c.name}</b>{c.role && <span className="text-ink-soft"> · {c.role}</span>}</p>
                {c.contact && <p className="break-all font-mono text-xs text-ink-soft">{c.contact}</p>}
                {c.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-faint">{c.notes}</p>}
              </div>
              <button className="text-xs text-ink-faint hover:text-danger" onClick={() => remove(c)}>quitar</button>
            </article>
          ))
        )}
      </div>
      <form onSubmit={add} className="space-y-3 self-start border border-line bg-card p-4 rounded-lg">
        <h2 className="font-display text-base font-extrabold text-ink">Agregar contacto</h2>
        <input className="field" placeholder="Nombre" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" placeholder="Rol (ej. Cliente, DBA, Diseño)" maxLength={100} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        <input className="field" placeholder="Email, teléfono, usuario…" maxLength={200} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        <textarea className="field" rows={2} placeholder="Notas (ej. de qué sabe, horario)" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="btn-primary w-full" disabled={busy || !form.name.trim()}>Agregar</button>
      </form>
    </div>
  );
}
