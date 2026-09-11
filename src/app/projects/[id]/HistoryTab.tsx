import { FIELD_LABEL } from "@/lib/historyLabels";

type Entry = {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date | string;
  changedByName: string | null;
  taskTitle: string | null;
};

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function HistoryTab({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
        Todavía no hay historial sincronizado para este proyecto.
      </p>
    );
  }

  return (
    <ul className="space-y-4 border-l-2 border-line pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative text-sm">
          <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-rust" />
          <p className="text-ink">
            <span className="font-semibold">{FIELD_LABEL[entry.field] ?? entry.field}</span>
            {entry.taskTitle && <span className="text-ink-soft"> · {entry.taskTitle}</span>}
            {entry.oldValue && entry.newValue && (
              <span className="text-ink-soft">
                {" "}
                — de &quot;{entry.oldValue}&quot; a &quot;{entry.newValue}&quot;
              </span>
            )}
            {!entry.oldValue && entry.newValue && <span className="text-ink-soft"> — {entry.newValue}</span>}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {entry.changedByName ?? "Sistema"} · {new Date(entry.changedAt).toLocaleString()} · {timeAgo(entry.changedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
