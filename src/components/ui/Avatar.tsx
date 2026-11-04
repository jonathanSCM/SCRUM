import { colorForName, initials } from "@/lib/ui";

export default function Avatar({ name, size = 24, title }: { name: string | null | undefined; size?: number; title?: string }) {
  if (!name) {
    return (
      <span
        title="Sin asignar"
        className="inline-flex shrink-0 items-center justify-center border-2 border-dashed border-line-strong text-ink-faint"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={title ?? name}
      className="inline-flex shrink-0 select-none items-center justify-center border-2 border-ink font-bold text-[#150b22]"
      style={{ width: size, height: size, background: colorForName(name), fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}
