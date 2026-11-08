"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/ui";

type Person = { id: string; name: string };

// Cuadro de texto que sugiere personas al escribir "@" (se inserta "@Nombre Apellido ").
export default function MentionTextarea({ value, onChange, people, className, ...rest }: { value: string; onChange: (v: string) => void; people: Person[] } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const options = useMemo(() => {
    if (!trigger) return [];
    const q = norm(trigger.query);
    return people.filter((p) => norm(p.name).includes(q)).slice(0, 6);
  }, [trigger, people]);

  function onInput(v: string, caret: number) {
    onChange(v);
    const m = v.slice(0, caret).match(/(^|\s)@([^\s@]*)$/);
    if (m) {
      setTrigger({ start: caret - m[2].length - 1, query: m[2] });
      setActive(0);
    } else setTrigger(null);
  }

  function pick(p: Person) {
    if (!trigger || !ref.current) return;
    const caret = ref.current.selectionStart ?? value.length;
    const text = `@${p.name} `;
    onChange(value.slice(0, trigger.start) + text + value.slice(caret));
    setTrigger(null);
    const pos = trigger.start + text.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      {trigger && options.length > 0 && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-hard-lg" role="listbox">
          {options.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)} className={cn("block w-full px-3 py-1.5 text-left text-sm text-ink", i === active && "bg-card-2")}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={(e) => {
          if (trigger && options.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[Math.min(active, options.length - 1)]); return; }
            if (e.key === "Escape") { setTrigger(null); return; }
          }
          rest.onKeyDown?.(e);
        }}
      />
    </div>
  );
}
