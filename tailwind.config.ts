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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Archivo", "sans-serif"],
      },
      borderRadius: {
        xl2: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
