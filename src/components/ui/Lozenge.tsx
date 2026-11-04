import { SPRINT_STATE_META, STATUS_META, type IssueStatus, type SprintState } from "@/lib/scrum/constants";

export function StatusLozenge({ status }: { status: IssueStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.TODO;
  return (
    <span className="lozenge" style={{ color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function SprintStateLozenge({ state }: { state: SprintState }) {
  const meta = SPRINT_STATE_META[state] ?? SPRINT_STATE_META.PLANNED;
  return (
    <span className="lozenge" style={{ color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function PointsBadge({ points }: { points: number | null }) {
  return (
    <span
      title="Story points"
      className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center border-2 border-line-strong px-1 font-mono text-[10px] font-bold text-ink-soft"
    >
      {points ?? "–"}
    </span>
  );
}
