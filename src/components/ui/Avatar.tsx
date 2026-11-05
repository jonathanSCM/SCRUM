"use client";

import { useEffect, useState } from "react";
import { colorForName, initials } from "@/lib/ui";

// Ids que ya sabemos que no tienen foto (así no se vuelve a pedir en cada avatar de la pantalla).
const missing = new Set<string>();
const EVENT = "avatar-updated";

// Avisa a todos los avatares montados que la foto de alguien cambió.
export function notifyAvatarChanged(userId: string) {
  missing.delete(userId);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: userId }));
}

// Con userId muestra la foto de perfil si existe; si no, las iniciales sobre el color.
// Las iniciales siempre están debajo, así no hay parpadeo mientras carga la foto.
export default function Avatar({ name, size = 24, title, color, userId }: { name: string | null | undefined; size?: number; title?: string; color?: string | null; userId?: string | null }) {
  const [failed, setFailed] = useState(() => (userId ? missing.has(userId) : true));
  const [nonce, setNonce] = useState(0);
  // La foto se pide recién con la pantalla ya montada: si se pidiera durante el render del servidor,
  // un error 404 ocurriría antes de que React escuche el evento y quedaría el icono de imagen rota.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!userId) return;
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== userId) return;
      setFailed(false);
      setNonce((n) => n + 1);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [userId]);

  if (!name) {
    return (
      <span
        title="Sin asignar"
        className="inline-flex shrink-0 items-center justify-center border border-dashed border-line-strong text-ink-faint rounded-md"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={title ?? name}
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold ${color ? "text-white" : "text-[#1b1730]"}`}
      style={{ width: size, height: size, background: color ?? colorForName(name), fontSize: size * 0.4 }}
    >
      {initials(name)}
      {userId && mounted && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={nonce}
          src={`/api/users/${userId}/image/avatar${nonce ? `?n=${nonce}` : ""}`}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            missing.add(userId);
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
