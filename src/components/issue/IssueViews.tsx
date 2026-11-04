"use client";

import type { CSSProperties } from "react";
import { cn, formatDate, isOverdue } from "@/lib/ui";
import { STATUSES, STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import type { IssueCardData } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import { CalendarIcon, CommentIcon, DragIcon, PaperclipIcon, PriorityIcon, TypeIcon } from "@/components/ui/Icons";
import { PointsBadge } from "@/components/ui/Lozenge";

export function EpicChip({ epic }: { epic: NonNullable<IssueCardData["epic"]> }) {
  const color = epic.color ?? "#8b5cf6";
  return (
    <span
      title={`Épica ${epic.key}: ${epic.title}`}
      className="inline-block max-w-[9rem] truncate border px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide rounded-md"
      style={{ color: "#1b1730", background: `${color}26`, borderColor: `${color}80` }}
    >
      {epic.title}
    </span>
  );
}

export function DueBadge({ dueDate, done }: { dueDate: string | null; done: boolean }) {
  if (!dueDate) return null;
  const overdue = isOverdue(dueDate, done);
  return (
    <span
      title={overdue ? "Vencido" : "Fecha límite"}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold", overdue ? "text-danger" : "text-ink-faint")}
    >
      <CalendarIcon size={12} />
      {formatDate(dueDate)}
    </span>
  );
}

export function LabelChips({ labels, max = 2 }: { labels: string[]; max?: number }) {
  if (labels.length === 0) return null;
  return (
    <>
      {labels.slice(0, max).map((l) => (
        <span key={l} className="border border-line-strong px-1 text-[10px] font-semibold text-ink-faint rounded-md">
          {l}
        </span>
      ))}
      {labels.length > max && <span className="text-[10px] text-ink-faint">+{labels.length - max}</span>}
    </>
  );
}

// ---- Fila del backlog ----

export function IssueRowView({
  issue,
  selected,
  onToggleSelect,
  onStatusChange,
  onOpen,
  dragging,
  handleProps,
  style,
  readyItems,
}: {
  issue: IssueCardData;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStatusChange?: (status: IssueStatus) => void;
  onOpen?: () => void;
  dragging?: boolean;
  handleProps?: Record<string, unknown>;
  style?: CSSProperties;
  readyItems?: string[];
}) {
  const done = issue.status === "DONE";
  const readyMissing = readyItems && !done ? readyItems.filter((i) => !issue.readyDone.includes(i)).length : 0;
  return (
    <div
      style={style}
      onClick={onOpen}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 border-b border-line-strong bg-card px-3 py-2 transition-colors hover:bg-card-2",
        selected && "bg-card-2 outline outline-2 -outline-offset-2 outline-moss",
        dragging && "border border-line shadow-hard-sm rounded-md"
      )}
    >
      {handleProps && (
        <span className="hidden cursor-grab touch-none text-ink-faint active:cursor-grabbing sm:inline-flex" {...handleProps} onClick={(e) => e.stopPropagation()} aria-label="Arrastrar">
          <DragIcon size={14} />
        </span>
      )}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(issue.id)}
          className="h-4 w-4 shrink-0 accent-moss"
          aria-label={`Seleccionar ${issue.key}`}
        />
      )}
      <TypeIcon type={issue.issueType} size={18} />
      <span className="w-[4.2rem] shrink-0 font-mono text-xs text-ink-faint">{issue.key}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", done ? "text-ink-faint line-through" : "text-ink")}>{issue.title}</span>

      {issue.parent && (
        <span className="hidden max-w-[8rem] shrink-0 truncate font-mono text-[11px] text-ink-faint md:inline" title={`Historia ${issue.parent.key}: ${issue.parent.title}`}>
          {issue.parent.key}
        </span>
      )}
      {issue.checklist.total > 0 && (
        <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint sm:inline" title="Checklist">
          {issue.checklist.done}/{issue.checklist.total}
        </span>
      )}
      {readyMissing > 0 && (
        <span className="hidden shrink-0 text-xs font-semibold text-warn sm:inline" title="Faltan ítems de la Definition of Ready">
          Falta info ({readyMissing})
        </span>
      )}
      <span className="hidden items-center gap-1.5 lg:flex">
        <LabelChips labels={issue.labels} />
      </span>
      {issue.epic && (
        <span className="hidden md:inline-flex">
          <EpicChip epic={issue.epic} />
        </span>
      )}
      <span className="hidden md:inline-flex">
        <DueBadge dueDate={issue.dueDate} done={done} />
      </span>

      {onStatusChange ? (
        <select
          aria-label={`Estado de ${issue.key}`}
          value={issue.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(e.target.value as IssueStatus)}
          className="lozenge cursor-pointer bg-transparent outline-none"
          style={{ color: STATUS_META[issue.status].color }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} className="bg-card text-ink">
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      ) : null}
      <PriorityIcon priority={issue.priority} />
      <PointsBadge points={issue.storyPoints} />
      <Avatar name={issue.assignee?.name} size={22} />
    </div>
  );
}

// ---- Tarjeta del tablero ----

export function IssueCardView({
  issue,
  onOpen,
  dragging,
  overlay,
  style,
}: {
  issue: IssueCardData;
  onOpen?: () => void;
  dragging?: boolean;
  overlay?: boolean;
  style?: CSSProperties;
}) {
  const done = issue.status === "DONE";
  const accent = issue.epic?.color ?? null;
  return (
    <div
      style={{ ...style, borderTopColor: accent ?? undefined, borderTopWidth: accent ? 5 : undefined }}
      onClick={onOpen}
      className={cn(
        "cursor-pointer select-none border border-line bg-card p-3 transition-[box-shadow,transform] duration-100",
        !dragging && !overlay && "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-sm",
        dragging && "opacity-35",
        overlay && "rotate-2 scale-[1.03] border-moss shadow-hard-purple"
      )}
    >
      {issue.epic && (
        <div className="mb-1.5">
          <EpicChip epic={issue.epic} />
        </div>
      )}
      <p className={cn("line-clamp-3 text-sm font-medium leading-snug", done ? "text-ink-faint line-through" : "text-ink")}>{issue.title}</p>
      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <LabelChips labels={issue.labels} max={3} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <TypeIcon type={issue.issueType} size={16} />
        <span className="whitespace-nowrap font-mono text-[11px] text-ink-faint">{issue.key}</span>
        <DueBadge dueDate={issue.dueDate} done={done} />
        <span className="ml-auto flex items-center gap-2">
          {issue.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-faint">
              <CommentIcon size={12} />
              {issue.commentCount}
            </span>
          )}
          {issue.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-faint">
              <PaperclipIcon size={12} />
              {issue.attachmentCount}
            </span>
          )}
          <PriorityIcon priority={issue.priority} size={15} />
          <PointsBadge points={issue.storyPoints} />
          <Avatar name={issue.assignee?.name} size={22} />
        </span>
      </div>
    </div>
  );
}
