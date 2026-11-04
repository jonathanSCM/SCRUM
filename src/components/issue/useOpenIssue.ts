"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Abre el panel de un ticket sin salir de la pantalla actual (?issue=PRO-12).
export function useOpenIssue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (key: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("issue", key);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, params]
  );
}
