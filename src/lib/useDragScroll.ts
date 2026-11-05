"use client";

import { useEffect, useRef, type RefObject } from "react";

// "Agarrar y arrastrar" para desplazarse en horizontal, como un mapa. Solo con
// mouse (en pantallas táctiles queda el gesto nativo de deslizar). Los
// elementos marcados con data-no-pan, los botones, enlaces y campos conservan su
// comportamiento; si se arrastró de verdad, se cancela el clic final para no
// abrir un proyecto sin querer.
export function useDragScroll<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startScroll = 0;
    let pointerId: number | null = null;
    let panning = false;

    const isBlocked = (target: EventTarget | null) => target instanceof Element && !!target.closest("[data-no-pan], button, input, select, textarea, label");

    function onDown(e: PointerEvent) {
      if (e.pointerType !== "mouse" || e.button !== 0 || isBlocked(e.target)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = el!.scrollLeft;
      panning = false;
    }

    function onMove(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!panning) {
        if (Math.abs(dx) < 5) return;
        panning = true;
        el!.setPointerCapture(pointerId);
        el!.style.cursor = "grabbing";
        el!.style.userSelect = "none";
      }
      el!.scrollLeft = startScroll - dx;
    }

    function onUp(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (panning) {
        // El clic que sigue a un arrastre no debe activar el enlace de debajo.
        const swallow = (ev: Event) => ev.stopPropagation();
        el!.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => el!.removeEventListener("click", swallow, { capture: true }), 0);
        if (el!.hasPointerCapture(pointerId)) el!.releasePointerCapture(pointerId);
      }
      pointerId = null;
      panning = false;
      el!.style.cursor = "";
      el!.style.userSelect = "";
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return ref;
}
