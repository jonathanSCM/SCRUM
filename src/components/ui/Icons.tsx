import type { ReactNode } from "react";
import { ISSUE_TYPE_META, PRIORITY_META, type IssueType, type Priority } from "@/lib/scrum/constants";

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16M4 12h16" />
  </Svg>
);
export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5.5 5.5" />
  </Svg>
);
export const PaperclipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.2 3.2 0 014.5 4.5L9 17a1.4 1.4 0 01-2-2l7.5-7.5" />
  </Svg>
);
export const CommentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H10l-5 4v-4H4z" />
  </Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
  </Svg>
);
export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 5h13l-3 4 3 4H5" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const ChevronIcon = ({ open, ...p }: IconProps & { open?: boolean }) => (
  <Svg {...p} className={`transition-transform duration-150 ${open ? "rotate-90" : ""} ${p.className ?? ""}`}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);
export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2L5 13h6l-1 9 8-11h-6z" />
  </Svg>
);
export const DragIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3.2} />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

// Ícono de tipo de ticket: cuadrado de color con un símbolo oscuro.
export function TypeIcon({ type, size = 18 }: { type: IssueType; size?: number }) {
  const meta = ISSUE_TYPE_META[type] ?? ISSUE_TYPE_META.TASK;
  const glyph =
    type === "EPIC" ? (
      <path d="M13 3L6 13h5l-1 8 7-10h-5z" />
    ) : type === "STORY" ? (
      <path d="M7 4h10v16l-5-4-5 4z" />
    ) : type === "BUG" ? (
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    ) : (
      <path d="M6 12.5l4 4 8-9" />
    );
  return (
    <span
      title={meta.label}
      className="inline-flex shrink-0 items-center justify-center text-on-fill rounded-md"
      style={{ width: size, height: size, background: meta.color }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={type === "TASK" ? 3.2 : 1.4} strokeLinecap="square" aria-hidden="true">
        {type === "TASK" ? <g fill="none">{glyph}</g> : glyph}
      </svg>
    </span>
  );
}

export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.MEDIA;
  const path =
    priority === "URGENTE" ? (
      <path d="M6 14l6-6 6 6M6 20l6-6 6 6" />
    ) : priority === "ALTA" ? (
      <path d="M6 16l6-6 6 6" />
    ) : priority === "MEDIA" ? (
      <path d="M5 9h14M5 15h14" />
    ) : (
      <path d="M6 8l6 6 6-6" />
    );
  return (
    <span title={`Prioridad: ${meta.label}`} className="inline-flex shrink-0" style={{ color: meta.color }}>
      <Svg size={size}>{path}</Svg>
    </span>
  );
}
