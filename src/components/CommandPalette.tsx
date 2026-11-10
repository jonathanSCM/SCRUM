"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { SearchIcon, TypeIcon } from "@/components/ui/Icons";
import { StatusLozenge } from "@/components/ui/Lozenge";
import type { IssueStatus, IssueType } from "@/lib/scrum/constants";

type SearchProject = { id: string; key: string | null; name: string };
type SearchIssue = {
  id: string;
  key: string;
  title: string;
  snippet: string;
  issueType: IssueType;
  status: IssueStatus;
  projectId: string;
  projectName: string;
};

type Result =
  | { kind: "project"; id: string; label: string; sub: string }
  | { kind: "issue"; id: string; label: string; sub: string; issue: SearchIssue };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

// Buscador global (Cmd/Ctrl+K o "/"): proyectos y tickets por clave, título o
// descripción. El índice se pide una sola vez al abrir.
export default function CommandPalette() {
  const { status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<SearchProject[]>([]);
  const [issues, setIssues] = useState<SearchIssue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadIndex = useCallback(() => {
    if (loaded) return;
    fetch("/api/search")
      .then((res) => res.json())
      .then((body) => {
        setProjects(body.projects ?? []);
        setIssues(body.issues ?? []);
        setLoaded(true);
      })
      .catch(() => {});
  }, [loaded]);

  useEffect(() => {
    if (status !== "authenticated") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
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
      setLoaded(false);
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (open && !loaded) loadIndex();
  }, [open, loaded, loadIndex]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Array<{ score: number; result: Result }> = [];
    for (const p of projects) {
      const hay = `${p.key ?? ""} ${p.name}`.toLowerCase();
      if (hay.includes(q)) scored.push({ score: p.name.toLowerCase().startsWith(q) || p.key?.toLowerCase() === q ? 90 : 50, result: { kind: "project", id: p.id, label: p.name, sub: p.key ?? "Proyecto" } });
    }
    for (const i of issues) {
      const key = i.key.toLowerCase();
      const title = i.title.toLowerCase();
      let score = 0;
      if (key === q) score = 100;
      else if (key.startsWith(q)) score = 80;
      else if (title.startsWith(q)) score = 70;
      else if (title.includes(q)) score = 60;
      else if (i.snippet.toLowerCase().includes(q)) score = 30;
      if (score) scored.push({ score, result: { kind: "issue", id: i.id, label: i.title, sub: `${i.key} · ${i.projectName}`, issue: i } });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 9).map((s) => s.result);
  }, [query, projects, issues]);

  if (status !== "authenticated") return null;

  function go(r: Result) {
    setOpen(false);
    router.push(r.kind === "project" ? `/projects/${r.id}/board` : `/projects/${r.issue.projectId}/board?issue=${r.issue.key}`);
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
        aria-label="Buscar"
        className="flex items-center gap-2 border border-line-strong bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-moss hover:text-ink rounded-lg"
      >
        <SearchIcon size={14} />
        <span className="hidden xl:inline">Buscar</span>
        <span className="kbd hidden xl:inline">Ctrl K</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="w-full max-w-xl border border-line bg-card rounded-lg"
              initial={{ y: -16, scale: 0.97, boxShadow: "0 0 0 rgba(27, 23, 48, 0)" }}
              animate={{ y: 0, scale: 1, boxShadow: "0 12px 32px rgba(27, 23, 48, 0.16)" }}
              exit={{ y: -8, opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: "spring", stiffness: 460, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-line px-4">
                <SearchIcon size={18} className="text-ink-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDownInput}
                  placeholder="Buscar por clave (PRO-12), título o descripción…"
                  className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
                />
              </div>

              {query.trim() && results.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-faint">Sin resultados para “{query}”.</p>}

              {results.length > 0 && (
                <ul className="max-h-96 overflow-y-auto py-1.5">
                  {results.map((r, i) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <button
                        onClick={() => go(r)}
                        onMouseEnter={() => setActive(i)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-card-2 text-ink" : "text-ink-soft"}`}
                      >
                        {r.kind === "issue" ? <TypeIcon type={r.issue.issueType} size={18} /> : <span className="lozenge text-ink-faint">Proyecto</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{r.label}</span>
                          <span className="block truncate font-mono text-[11px] text-ink-faint">{r.sub}</span>
                        </span>
                        {r.kind === "issue" && <StatusLozenge status={r.issue.status} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!query.trim() && (
                <p className="px-4 py-6 text-center text-xs text-ink-faint">
                  Escribí para buscar · <span className="kbd">↑↓</span> moverte · <span className="kbd">Enter</span> abrir · <span className="kbd">Esc</span> cerrar
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
