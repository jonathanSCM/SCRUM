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
        "card-2": "var(--paper-raised-2)",
        ink: withOpacity("--ink-rgb"),
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        rust: { DEFAULT: withOpacity("--rust-rgb"), dark: "var(--rust-dark)" },
        moss: "var(--moss)",
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
        xl2: "0px",
      },
      boxShadow: {
        hard: "6px 6px 0 var(--moss)",
        "hard-sm": "3px 3px 0 var(--moss)",
        "hard-lg": "9px 9px 0 var(--moss)",
        "hard-purple": "5px 5px 0 var(--rust)",
        "hard-ink": "5px 5px 0 rgba(246, 242, 255, 0.9)",
        "hard-danger": "5px 5px 0 var(--danger)",
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
