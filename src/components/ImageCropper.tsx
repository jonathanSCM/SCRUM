"use client";

import { useEffect, useRef, useState } from "react";

// Ventana para elegir qué zona de la foto se va a ver: se arrastra la imagen y se acerca con el control.
// Devuelve la zona ya recortada (JPEG) lista para subir.
export default function ImageCropper({ file, aspect, circle, outputWidth, onCancel, onDone }: { file: File; aspect: number; circle?: boolean; outputWidth: number; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const frameW = aspect >= 2 ? 360 : 280;
  const frameH = Math.round(frameW / aspect);
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // esquina superior izquierda de la imagen dentro del marco
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const base = nat ? Math.max(frameW / nat.w, frameH / nat.h) : 1;
  const scale = base * zoom;
  const clamp = (x: number, y: number, s = scale) => {
    if (!nat) return { x, y };
    return { x: Math.min(0, Math.max(frameW - nat.w * s, x)), y: Math.min(0, Math.max(frameH - nat.h * s, y)) };
  };

  function onLoad() {
    const img = imgRef.current!;
    const n = { w: img.naturalWidth, h: img.naturalHeight };
    setNat(n);
    const s = Math.max(frameW / n.w, frameH / n.h);
    // Empieza centrada horizontalmente y mostrando la parte de arriba (donde suele estar la cara).
    setPos({ x: (frameW - n.w * s) / 2, y: 0 });
  }

  function changeZoom(z: number) {
    if (!nat) return;
    // Acerca hacia el centro del marco.
    const cx = (frameW / 2 - pos.x) / scale;
    const cy = (frameH / 2 - pos.y) / scale;
    const s = base * z;
    setZoom(z);
    setPos(clamp(frameW / 2 - cx * s, frameH / 2 - cy * s, s));
  }

  function save() {
    if (!nat || !imgRef.current) return;
    const outW = outputWidth;
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(imgRef.current, -pos.x / scale, -pos.y / scale, frameW / scale, frameH / scale, 0, 0, outW, outH);
    canvas.toBlob((b) => b && onDone(b), "image/jpeg", 0.9);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Elegir la zona de la imagen">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-line-strong bg-surface p-5 shadow-hard-lg">
        <div>
          <h3 className="font-display text-lg font-extrabold text-ink">Elige la zona</h3>
          <p className="text-xs text-ink-soft">Arrastra la imagen para encuadrar {circle ? "tu cara" : "el banner"} y usa el control para acercar.</p>
        </div>
        <div className="flex justify-center">
          <div
            className="relative touch-none select-none overflow-hidden bg-paper-deep"
            style={{ width: frameW, height: frameH, cursor: "grab" }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgRef} src={url} alt="" draggable={false} onLoad={onLoad} className="absolute left-0 top-0 max-w-none" style={nat ? { width: nat.w * scale, height: nat.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` } : { visibility: "hidden" }} />
            )}
            {circle && <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 999px rgba(0,0,0,0.5)", border: "2px solid #fff" }} />}
          </div>
        </div>
        <label className="flex items-center gap-3 text-xs font-semibold text-ink-soft">
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!nat} onClick={save}>Usar esta zona</button>
        </div>
      </div>
    </div>
  );
}
