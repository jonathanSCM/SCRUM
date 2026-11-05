"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/client";
import { describeHistory } from "@/lib/historyText";
import { formatBytes, formatDateTime, timeAgo, cn } from "@/lib/ui";
import {
  ISSUE_TYPES,
  ISSUE_TYPE_META,
  PRIORITIES,
  PRIORITY_META,
  STATUSES,
  STATUS_META,
  STORY_POINT_OPTIONS,
  MAX_ATTACHMENT_BYTES,
  type IssueStatus,
  type IssueType,
  type Priority,
} from "@/lib/scrum/constants";
import Avatar from "@/components/ui/Avatar";
import { CommentIcon, PaperclipIcon, TrashIcon, XIcon, TypeIcon, PriorityIcon } from "@/components/ui/Icons";
import { StatusLozenge } from "@/components/ui/Lozenge";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { useOpenIssue } from "./useOpenIssue";

type UserRef = { id: string; name: string };
type EpicOption = { id: string; number: number | null; title: string; epicColor: string | null };
type SprintOption = { id: string; name: string; state: string };

type IssueDetail = {
  id: string;
  number: number | null;
  projectId: string;
  title: string;
  description: string;
  issueType: IssueType;
  status: IssueStatus;
  priority: Priority;
  storyPoints: number | null;
  labels: string[];
  readyDone: string[];
  checklist: Array<{ id: string; text: string; done: boolean }>;
  parentId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  sprintId: string | null;
  epicId: string | null;
  epicColor: string | null;
  assigneeUserId: string | null;
  assignee: UserRef | null;
  reporter: UserRef | null;
};

type Comment = { id: string; body: string; createdAt: string; updatedAt: string; author: UserRef | null };
type Attachment = { id: string; filename: string; mimeType: string; size: number; createdAt: string; uploadedBy: UserRef | null };
type HistoryRow = { id: string; field: string; oldValue: string | null; newValue: string | null; taskTitle: string | null; changedAt: string; changedByName: string | null };
type Child = { id: string; number: number | null; title: string; status: IssueStatus; storyPoints: number | null; issueType: IssueType };

type Payload = {
  issue: IssueDetail;
  project: { id: string; key: string | null; name: string } | null;
  comments: Comment[];
  attachments: Attachment[];
  history: HistoryRow[];
  children: Child[];
  options: { members: UserRef[]; sprints: SprintOption[]; epics: EpicOption[]; stories: Array<{ id: string; number: number | null; title: string }>; readyItems: string[] };
};

// Panel lateral de un ticket (estilo Jira). Se abre con ?issue=PRO-12 desde
// cualquier pantalla, así los links a un ticket son compartibles.
export default function IssueDrawer({ currentUserId, currentUserRole }: { currentUserId: string; currentUserRole: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = params.get("issue");

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("issue");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    if (!key) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        (el as HTMLElement).blur();
        return;
      }
      close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [key, close]);

  return (
    <AnimatePresence>
      {key && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[55] bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            key="panel"
            className="fixed inset-y-0 right-0 z-[56] flex w-full max-w-[860px] flex-col overflow-hidden border-l border-line bg-paper"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: { duration: 0.18, ease: "easeIn" } }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            aria-label={`Ticket ${key}`}
          >
            <DrawerBody issueKey={key} onClose={close} currentUserId={currentUserId} currentUserRole={currentUserRole} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  issueKey,
  onClose,
  currentUserId,
  currentUserRole,
}: {
  issueKey: string;
  onClose: () => void;
  currentUserId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const openIssue = useOpenIssue();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"comments" | "activity">("comments");

  const load = useCallback(async () => {
    const res = await api<Payload>(`/api/issues/by-key/${encodeURIComponent(issueKey)}`);
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [issueKey]);

  useEffect(() => {
    setData(null);
    setError(null);
    load();
  }, [load]);

  const issue = data?.issue;

  async function patch(partial: Record<string, unknown>) {
    if (!issue) return;
    const res = await api<Partial<IssueDetail>>(`/api/issues/${issue.id}`, "PATCH", partial);
    if (!res.ok) {
      toast.error(res.error);
      await load();
      return;
    }
    await load();
    router.refresh();
  }

  async function remove() {
    if (!issue || !data) return;
    const ok = await confirm(`¿Borrar ${issueKey}? Se pierden sus comentarios y adjuntos.`);
    if (!ok) return;
    const res = await api(`/api/issues/${issue.id}`, "DELETE");
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${issueKey} borrado`);
    onClose();
    router.refresh();
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <DrawerHeader issueKey={issueKey} onClose={onClose} />
        <div className="p-6">
          <p className="border border-danger bg-danger-bg p-4 text-sm text-danger rounded-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !issue) {
    return (
      <div className="flex h-full flex-col">
        <DrawerHeader issueKey={issueKey} onClose={onClose} />
        <div className="space-y-4 p-6">
          <div className="skeleton h-9 w-3/4" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    );
  }

  const isEpic = issue.issueType === "EPIC";
  const isStory = issue.issueType === "STORY";
  const canHaveParent = issue.issueType === "TASK" || issue.issueType === "BUG";
  const done = data.children.filter((c) => c.status === "DONE").length;

  return (
    <div className="flex h-full flex-col">
      <DrawerHeader
        issueKey={issueKey}
        projectName={data.project?.name}
        issueType={issue.issueType}
        onClose={onClose}
        onDelete={remove}
      />

      <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_260px]">
        {/* ---- columna principal ---- */}
        <div className="min-w-0 space-y-6 p-5 md:overflow-y-auto md:p-6">
          <EditableTitle value={issue.title} onSave={(title) => patch({ title })} />

          <DescriptionEditor value={issue.description} onSave={(description) => patch({ description })} />

          {(isEpic || isStory) && (
            <section>
              <h3 className="mb-2 font-display text-sm font-bold text-ink">
                {isEpic ? "Tickets de la épica" : "Tareas de la historia"} <span className="font-mono text-ink-faint">({done}/{data.children.length})</span>
              </h3>
              {data.children.length === 0 ? (
                <p className="text-sm text-ink-faint">{isEpic ? "Todavía no hay tickets en esta épica. Elegí la épica desde cualquier ticket." : "Todavía no hay tareas en esta historia. Elegí la historia desde una tarea o un bug."}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.children.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => openIssue(`${data.project?.key ?? ""}-${c.number}`)}
                        className="flex w-full items-center gap-2 border border-line-strong px-2.5 py-1.5 text-left text-sm text-ink hover:border-moss rounded-md"
                      >
                        <TypeIcon type={c.issueType} size={16} />
                        <span className="font-mono text-xs text-ink-faint">{data.project?.key}-{c.number}</span>
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        <StatusLozenge status={c.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!isEpic && data.options.readyItems.length > 0 && (
            <ReadyChecklist items={data.options.readyItems} done={issue.readyDone} onChange={(readyDone) => patch({ readyDone })} />
          )}

          {!isEpic && <Checklist items={issue.checklist} onChange={(checklist) => patch({ checklist })} />}

          <Attachments issueId={issue.id} items={data.attachments} onChange={load} />

          <section>
            <div className="mb-3 flex gap-5 border-b border-line-strong">
              {(
                [
                  ["comments", `Comentarios (${data.comments.length})`],
                  ["activity", "Actividad"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors",
                    tab === id ? "border-rust text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "comments" ? (
              <Comments issueId={issue.id} items={data.comments} currentUserId={currentUserId} currentUserRole={currentUserRole} onChange={() => { load(); router.refresh(); }} />
            ) : (
              <Activity items={data.history} />
            )}
          </section>
        </div>

        {/* ---- columna de campos ---- */}
        <aside className="space-y-4 border-t border-line-strong bg-paper-deep p-5 md:border-l md:border-t-0">
          <Field label="Estado">
            <select
              className="field field-sm"
              value={issue.status}
              disabled={isEpic}
              onChange={(e) => patch({ status: e.target.value })}
              style={{ color: STATUS_META[issue.status].color, borderColor: STATUS_META[issue.status].color }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            {isEpic && <p className="mt-1 text-[11px] text-ink-faint">El progreso de una épica se calcula con sus tickets.</p>}
          </Field>

          <Field label="Tipo">
            <div className="flex items-center gap-2">
              <TypeIcon type={issue.issueType} size={20} />
              <select className="field field-sm flex-1" value={issue.issueType} onChange={(e) => patch({ issueType: e.target.value })}>
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>{ISSUE_TYPE_META[t].label}</option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Encargado">
            <div className="flex items-center gap-2">
              <Avatar name={issue.assignee?.name} userId={issue.assignee?.id} size={22} />
              <select className="field field-sm flex-1" value={issue.assigneeUserId ?? ""} onChange={(e) => patch({ assigneeUserId: e.target.value || null })}>
                <option value="">Sin asignar</option>
                {data.options.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            {issue.assigneeUserId !== currentUserId && (
              <button className="mt-1 text-[11px] text-moss-ink hover:underline" onClick={() => patch({ assigneeUserId: currentUserId })}>
                Asignármelo
              </button>
            )}
          </Field>

          <Field label="Reportado por">
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <Avatar name={issue.reporter?.name} userId={issue.reporter?.id} size={22} />
              {issue.reporter?.name ?? "—"}
            </div>
          </Field>

          <Field label="Prioridad">
            <div className="flex items-center gap-2">
              <PriorityIcon priority={issue.priority} size={18} />
              <select className="field field-sm flex-1" value={issue.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
            </div>
          </Field>

          {!isEpic && (
            <Field label="Story points">
              <select
                className="field field-sm"
                value={issue.storyPoints ?? ""}
                onChange={(e) => patch({ storyPoints: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">Sin estimar</option>
                {STORY_POINT_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          )}

          {!isEpic && (
            <Field label="Sprint">
              <select className="field field-sm" value={issue.sprintId ?? ""} onChange={(e) => patch({ sprintId: e.target.value || null })}>
                <option value="">Backlog</option>
                {data.options.sprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.state === "ACTIVE" ? " (activo)" : ""}</option>
                ))}
              </select>
            </Field>
          )}

          {canHaveParent && (
            <Field label="Historia">
              <select className="field field-sm" value={issue.parentId ?? ""} onChange={(e) => patch({ parentId: e.target.value || null })}>
                <option value="">Sin historia</option>
                {data.options.stories.map((st) => (
                  <option key={st.id} value={st.id}>{data.project?.key}-{st.number} {st.title}</option>
                ))}
              </select>
            </Field>
          )}

          {!isEpic && (
            <Field label="Épica">
              <select className="field field-sm" value={issue.epicId ?? ""} onChange={(e) => patch({ epicId: e.target.value || null })}>
                <option value="">Sin épica</option>
                {data.options.epics.map((e) => (
                  <option key={e.id} value={e.id}>{data.project?.key}-{e.number} {e.title}</option>
                ))}
              </select>
            </Field>
          )}

          {isEpic && (
            <Field label="Color de la épica">
              <input type="color" className="h-9 w-full cursor-pointer border border-line bg-paper-deep rounded-lg" value={issue.epicColor ?? "#8b5cf6"} onChange={(e) => patch({ epicColor: e.target.value })} />
            </Field>
          )}

          <Field label="Fecha límite">
            <input
              type="date"
              className="field field-sm"
              value={issue.dueDate ? issue.dueDate.slice(0, 10) : ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
            />
          </Field>

          <Labels labels={issue.labels} onChange={(labels) => patch({ labels })} />

          <div className="space-y-0.5 border-t border-line-strong pt-3 text-[11px] text-ink-faint">
            <p>Creado {formatDateTime(issue.createdAt)}</p>
            <p>Actualizado {timeAgo(issue.updatedAt)}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DrawerHeader({
  issueKey,
  projectName,
  issueType,
  onClose,
  onDelete,
}: {
  issueKey: string;
  projectName?: string;
  issueType?: IssueType;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-3">
      {issueType && <TypeIcon type={issueType} size={20} />}
      <button
        className="font-mono text-sm font-bold text-ink hover:text-moss-ink"
        title="Copiar link del ticket"
        onClick={() => {
          navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?issue=${issueKey}`).then(
            () => toast.success("Link copiado"),
            () => toast.error("No se pudo copiar el link")
          );
        }}
      >
        {issueKey}
      </button>
      {projectName && <span className="truncate text-xs text-ink-faint">{projectName}</span>}
      <div className="ml-auto flex items-center gap-1">
        {onDelete && (
          <button onClick={onDelete} className="p-1.5 text-ink-faint hover:text-danger" aria-label="Borrar ticket" title="Borrar ticket">
            <TrashIcon size={18} />
          </button>
        )}
        <button onClick={onClose} className="p-1.5 text-ink-faint hover:text-ink" aria-label="Cerrar" title="Cerrar (Esc)">
          <XIcon size={20} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="field font-display text-xl font-bold"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <h2
      className="-mx-2 cursor-text border border-transparent px-2 py-1 font-display text-xl font-bold leading-snug text-ink hover:border-line-strong md:text-2xl rounded-md"
      onClick={() => setEditing(true)}
      title="Click para editar"
    >
      {value}
    </h2>
  );
}

function DescriptionEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function save() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  return (
    <section>
      <h3 className="mb-2 font-display text-sm font-bold text-ink">Descripción</h3>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={7}
            className="field"
            placeholder="Contá qué hay que hacer, criterios de aceptación, links…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={save}>Guardar</button>
            <button className="btn-ghost btn-sm" onClick={() => { setDraft(value); setEditing(false); }}>Cancelar</button>
            <span className="ml-auto self-center text-[11px] text-ink-faint">Ctrl+Enter guarda</span>
          </div>
        </div>
      ) : (
        <div
          className="min-h-[3.5rem] cursor-text whitespace-pre-wrap border border-transparent px-2 py-1.5 -mx-2 text-sm leading-relaxed text-ink-soft hover:border-line-strong rounded-md"
          onClick={() => setEditing(true)}
        >
          {value || <span className="text-ink-faint">Agregá una descripción…</span>}
        </div>
      )}
    </section>
  );
}

// Definition of Ready: qué falta para poder empezar este ticket.
function ReadyChecklist({ items, done, onChange }: { items: string[]; done: string[]; onChange: (done: string[]) => void }) {
  const covered = items.filter((i) => done.includes(i)).length;
  const ready = covered === items.length;
  function toggle(item: string) {
    // Se conservan los ítems que ya no están en la definición para no perder el dato.
    onChange(done.includes(item) ? done.filter((d) => d !== item) : [...done, item]);
  }
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-ink">
        Definition of Ready <span className="font-mono text-ink-faint">({covered}/{items.length})</span>
        <span className={`lozenge ${ready ? "text-moss-ink" : "text-warn"}`}>{ready ? "Listo para empezar" : "Falta información"}</span>
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item}>
            <label className="flex cursor-pointer items-center gap-2 border border-line-strong px-2.5 py-1.5 text-sm text-ink hover:border-moss rounded-md">
              <input type="checkbox" className="h-4 w-4 accent-moss" checked={done.includes(item)} onChange={() => toggle(item)} />
              <span className="min-w-0 flex-1 break-words">{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Checklist propio de la tarjeta (pasos chicos que no merecen un ticket).
function Checklist({ items, onChange }: { items: Array<{ id: string; text: string; done: boolean }>; onChange: (items: Array<{ id: string; text: string; done: boolean }>) => void }) {
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onChange([...items, { id: Math.random().toString(36).slice(2, 10), text, done: false }]);
  }

  return (
    <section>
      <h3 className="mb-2 font-display text-sm font-bold text-ink">
        Checklist {items.length > 0 && <span className="font-mono text-ink-faint">({done}/{items.length})</span>}
      </h3>
      {items.length > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
          <div className="h-full rounded-full bg-moss" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-moss" checked={it.done} onChange={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} />
            <span className={cn("min-w-0 flex-1 break-words", it.done ? "text-ink-faint line-through" : "text-ink")}>{it.text}</span>
            <button className="hidden text-xs text-ink-faint hover:text-danger group-hover:inline" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={`Quitar ${it.text}`}>quitar</button>
          </li>
        ))}
      </ul>
      <input
        className="field field-sm mt-2"
        placeholder="Agregar un paso y Enter"
        maxLength={200}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
    </section>
  );
}

function Labels({ labels, onChange }: { labels: string[]; onChange: (l: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const label = draft.trim().toLowerCase().slice(0, 30);
    setDraft("");
    if (!label || labels.includes(label) || labels.length >= 10) return;
    onChange([...labels, label]);
  }
  return (
    <Field label="Etiquetas">
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <span key={l} className="inline-flex items-center gap-1 border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft rounded-md">
            {l}
            <button className="text-ink-faint hover:text-danger" onClick={() => onChange(labels.filter((x) => x !== l))} aria-label={`Quitar ${l}`}>
              <XIcon size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        className="field field-sm mt-1.5"
        placeholder="Agregar etiqueta + Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </Field>
  );
}

function Attachments({ issueId, items, onChange }: { issueId: string; items: Attachment[]; onChange: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`El archivo supera el máximo de ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/issues/${issueId}/attachments`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error || "No se pudo subir el archivo");
      else {
        toast.success(`${file.name} adjuntado`);
        onChange();
        router.refresh();
      }
    } catch {
      toast.error("No hay conexión con el servidor");
    }
    setBusy(false);
  }

  async function remove(a: Attachment) {
    const res = await api(`/api/attachments/${a.id}`, "DELETE");
    if (!res.ok) toast.error(res.error);
    else {
      onChange();
      router.refresh();
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">
          Adjuntos <span className="font-mono text-ink-faint">({items.length})</span>
        </h3>
        <button className="btn-ghost btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <PaperclipIcon size={14} /> {busy ? "Subiendo…" : "Adjuntar"}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
        className={cn("border border-dashed p-2 transition-colors rounded-md", dragging ? "border-rust bg-card" : "border-line-strong")}
      >
        {items.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-ink-faint">Arrastrá un archivo acá o usá “Adjuntar” (máx. 5 MB).</p>
        ) : (
          <ul className="space-y-1">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-2 bg-card px-2 py-1.5 text-sm">
                <PaperclipIcon size={14} className="shrink-0 text-ink-faint" />
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-ink hover:text-moss-ink">
                  {a.filename}
                </a>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">{formatBytes(a.size)}</span>
                <button className="shrink-0 text-ink-faint hover:text-danger" onClick={() => remove(a)} aria-label={`Borrar ${a.filename}`}>
                  <TrashIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Comments({
  issueId,
  items,
  currentUserId,
  currentUserRole,
  onChange,
}: {
  issueId: string;
  items: Comment[];
  currentUserId: string;
  currentUserRole: string;
  onChange: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await api(`/api/issues/${issueId}/comments`, "POST", { body });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setDraft("");
    onChange();
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    const res = await api(`/api/comments/${id}`, "PATCH", { body });
    if (!res.ok) return toast.error(res.error);
    setEditingId(null);
    onChange();
  }

  async function remove(id: string) {
    const res = await api(`/api/comments/${id}`, "DELETE");
    if (!res.ok) return toast.error(res.error);
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <textarea
          rows={3}
          className="field"
          placeholder="Escribí un comentario…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="flex items-center gap-2">
          <button className="btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={send}>
            <CommentIcon size={14} /> Comentar
          </button>
          <span className="text-[11px] text-ink-faint">Ctrl+Enter envía</span>
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((c) => {
          const mine = c.author?.id === currentUserId || currentUserRole === "LEAD";
          return (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author?.name} userId={c.author?.id} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-bold text-ink">{c.author?.name ?? "Usuario eliminado"}</span>{" "}
                  <span className="text-ink-faint">{timeAgo(c.createdAt)}{c.updatedAt !== c.createdAt ? " · editado" : ""}</span>
                </p>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea rows={3} className="field" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus />
                    <div className="flex gap-2">
                      <button className="btn-primary btn-sm" onClick={() => saveEdit(c.id)}>Guardar</button>
                      <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{c.body}</p>
                )}
                {mine && editingId !== c.id && (
                  <p className="mt-1 flex gap-3 text-[11px]">
                    <button className="text-ink-faint hover:text-ink" onClick={() => { setEditingId(c.id); setEditDraft(c.body); }}>Editar</button>
                    <button className="text-ink-faint hover:text-danger" onClick={() => remove(c.id)}>Borrar</button>
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {items.length === 0 && <p className="text-sm text-ink-faint">Todavía no hay comentarios.</p>}
      </ul>
    </div>
  );
}

function Activity({ items }: { items: HistoryRow[] }) {
  const rows = useMemo(() => items.map((h) => ({ ...h, text: describeHistory(h) })), [items]);
  if (rows.length === 0) return <p className="text-sm text-ink-faint">Sin actividad registrada.</p>;
  return (
    <ul className="relative space-y-3 border-l border-line-strong pl-4">
      {rows.map((h) => (
        <li key={h.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 border border-line bg-rust rounded-md" />
          <p className="text-ink">
            <span className="font-bold">{h.changedByName ?? "Alguien"}</span> · {h.text.label.toLowerCase()}
            {h.text.detail ? <span className="text-ink-soft"> {h.text.detail.replace(/^«.*?» — /, "")}</span> : null}
          </p>
          <p className="text-[11px] text-ink-faint">{timeAgo(h.changedAt)}</p>
        </li>
      ))}
    </ul>
  );
}
