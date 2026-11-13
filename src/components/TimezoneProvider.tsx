"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/scrum/countries";

// Zona horaria de quien está viendo la app: la que eligió en su perfil; si no eligió, la de su navegador.
const Ctx = createContext<{ tz: string; chosen: boolean }>({ tz: DEFAULT_TZ, chosen: false });

export default function TimezoneProvider({ tz, children }: { tz: string | null; children: React.ReactNode }) {
  const [browser, setBrowser] = useState(DEFAULT_TZ);
  useEffect(() => {
    try {
      const b = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (b && isValidTimeZone(b)) setBrowser(b);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ tz: tz && isValidTimeZone(tz) ? tz : browser, chosen: !!tz }}>{children}</Ctx.Provider>;
}

export const useTimezone = () => useContext(Ctx);
