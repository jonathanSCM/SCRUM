"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) {
      setTheme(stored);
    } else {
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(systemPrefersDark ? "dark" : "light");
    }
  }, []);

  function toggle() {
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (systemPrefersDark ? "dark" : "light");
    const next: Theme = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage puede fallar en modo privado; el tema simplemente no persiste
    }
  }

  return (
    <button
      onClick={toggle}
      title="Cambiar tema claro/oscuro"
      className="flex h-8 w-8 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-rust hover:text-ink"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
