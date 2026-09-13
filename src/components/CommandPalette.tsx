"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Project = { id: string; name: string };
type Task = { id: string; title: string; projectId: string };

type Result =
  | { kind: "project"; id: string; label: string }
  | { kind: "task"; id: string; label: string; projectId: string; projectName: string };

// Cmd+K / Ctrl+K en cualquier página: busca por nombre de proyecto o título
// de tarea sobre un índice que se pide una sola vez al abrir (ver
// /api/search) y navega al elegido con las flechas + Enter o con un click.
export default function CommandPalette() {
  const { status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadIndex = useCallback(() => {
    if (loaded) return;
    fetch("/api/search")
      .then((res) => res.json())
      .then((body) => {
        setProjects(body.projects ?? []);
        setTasks(body.tasks ?? []);
        setLoaded(true);
      })
      .catch(() => {});
  }, [loaded]);

  useEffect(() => {
    if (status !== "authenticated") return;

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status]);

  useEffect(() => {
    if (open) {
      loadIndex();
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, loadIndex]);

  if (status !== "authenticated") return null;

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const q = query.trim().toLowerCase();

  const results: Result[] = q
    ? [
        ...projects
          .filter((p) => p.name.toLowerCase().includes(q))
          .map((p): Result => ({ kind: "project", id: p.id, label: p.name })),
        ...tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .map(
            (t): Result => ({
              kind: "task",
              id: t.id,
              label: t.title,
              projectId: t.projectId,
              projectName: projectById.get(t.projectId)?.name ?? "Proyecto",
            })
          ),
      ].slice(0, 8)
    : [];

  function go(r: Result) {
    setOpen(false);
    router.push(r.kind === "project" ? `/projects/${r.id}` : `/projects/${r.projectId}`);
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((v) => Math.min(v + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 border-2 border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink-soft sm:flex"
      >
        Buscar
        <span className="border-2 border-line px-1.5 py-0 font-mono text-[10px]">⌘K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg border-2 border-line bg-card shadow-[6px_6px_0_var(--moss)]"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDownInput}
              placeholder="Buscar un proyecto o una tarea..."
              className="w-full border-b-2 border-line bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            />

            {q && results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">Sin resultados para &quot;{query}&quot;.</p>
            )}

            {results.length > 0 && (
              <ul className="max-h-80 overflow-y-auto py-1.5">
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      onClick={() => go(r)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                        i === active ? "bg-card-2 text-ink" : "text-ink-soft"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                        {r.kind === "project" ? "Proyecto" : r.projectName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!q && (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">
                Escribí para buscar proyectos y tareas · <kbd className="font-mono">Esc</kbd> para cerrar
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
