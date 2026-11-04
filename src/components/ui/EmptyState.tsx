export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-2 border-dashed border-line-strong px-6 py-10 text-center">
      <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 opacity-80">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="h-2.5 w-2.5 border-2 border-line-strong" style={{ background: i % 4 === 0 ? "var(--moss)" : "transparent" }} />
        ))}
      </div>
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action}
    </div>
  );
}
