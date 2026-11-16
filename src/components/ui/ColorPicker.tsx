"use client";

import { PROJECT_COLORS } from "@/lib/scrum/projectColor";
import { cn } from "@/lib/ui";

// Color opcional: un círculo por color y «Sin color». `value` es "" cuando no hay color.
export default function ColorPicker({ value, onChange, label = "Color (opcional)" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink-soft">{label}</label>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === ""}
          onClick={() => onChange("")}
          className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", value === "" ? "border-rust bg-chip-tint text-rust" : "border-line-strong text-ink-soft")}
        >
          Sin color
        </button>
        {PROJECT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn("h-7 w-7 rounded-full border-2 transition-transform", value === c.value ? "scale-110 border-ink" : "border-transparent hover:scale-105")}
            style={{ background: c.value }}
          />
        ))}
      </div>
    </div>
  );
}
