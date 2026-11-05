import type { Config } from "tailwindcss";

function withOpacity(variable: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue === undefined) return `rgb(var(${variable}))`;
    return `rgb(var(${variable}) / ${opacityValue})`;
  };
}

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: withOpacity("--paper-rgb"),
        "paper-deep": "var(--paper-deep)",
        card: "var(--paper-raised)",
        surface: withOpacity("--surface-rgb"),
        "on-fill": "var(--on-fill)",
        "chat-bg": "var(--chat-bg)",
        "bubble-mine": "var(--bubble-mine)",
        "chip-tint": "var(--chip-tint)",
        "card-2": "var(--paper-raised-2)",
        ink: withOpacity("--ink-rgb"),
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        rust: { DEFAULT: withOpacity("--rust-rgb"), dark: "var(--rust-dark)" },
        moss: { DEFAULT: "var(--moss)", ink: "var(--moss-ink)" },
        accent: withOpacity("--accent-rgb"),
        danger: { DEFAULT: "var(--danger)", bg: "var(--danger-bg)" },
        warn: "var(--warn)",
        blue: "var(--blue)",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Archivo", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl2: "10px",
      },
      boxShadow: {
        hard: "0 4px 14px rgb(var(--shadow-rgb) / 0.08)",
        "hard-sm": "0 1px 2px rgb(var(--shadow-rgb) / 0.08)",
        "hard-lg": "0 12px 32px rgb(var(--shadow-rgb) / 0.14)",
        "hard-purple": "0 8px 24px rgba(109, 40, 217, 0.16)",
        "hard-ink": "0 4px 14px rgb(var(--shadow-rgb) / 0.1)",
        "hard-danger": "0 4px 14px rgba(220, 38, 38, 0.16)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pop: {
          "0%": { opacity: "0", transform: "translate(0, 8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        pop: "pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2) both",
      },
    },
  },
  plugins: [],
};

export default config;
