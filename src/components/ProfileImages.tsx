"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar, { notifyAvatarChanged } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toaster";

// Foto de perfil y banner. El servidor recorta al centro y reduce la imagen, así que
// se puede subir la foto tal cual sale de la cámara (JPG, PNG, WebP o GIF, hasta 10 MB).
export default function ProfileImages({ userId, name, chatColor, hasAvatar, hasBanner }: { userId: string; name: string; chatColor: string; hasAvatar: boolean; hasBanner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [avatar, setAvatar] = useState(hasAvatar);
  const [banner, setBanner] = useState(hasBanner);
  const [bannerNonce, setBannerNonce] = useState(0);
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    try {
      const res = await fetch("/api/users/me/image", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) return toast.error(json?.error ?? "No se pudo subir la imagen");
      if (kind === "avatar") {
        setAvatar(true);
        notifyAvatarChanged(userId);
      } else {
        setBanner(true);
        setBannerNonce((n) => n + 1);
      }
      toast.success(kind === "avatar" ? "Foto actualizada" : "Banner actualizado");
      router.refresh();
    } catch {
      toast.error("No hay conexión con el servidor");
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: "avatar" | "banner") {
    setBusy(kind);
    const res = await fetch(`/api/users/me/image?kind=${kind}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast.error("No se pudo quitar la imagen");
    if (kind === "avatar") {
      setAvatar(false);
      // Sin foto: se vuelve a las iniciales en todos los avatares de la pantalla.
      window.location.reload();
    } else setBanner(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Banner</label>
        <div className="relative h-28 overflow-hidden rounded-lg border border-line bg-rust sm:h-32">
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/users/${userId}/image/banner?n=${bannerNonce}`} alt="Banner" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void upload("banner", e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => bannerInput.current?.click()}>{busy === "banner" ? "Subiendo…" : banner ? "Cambiar banner" : "Subir banner"}</button>
          {banner && <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy !== null} onClick={() => remove("banner")}>Quitar</button>}
        </div>
        <p className="mt-1 text-xs text-ink-faint">Se recorta a un formato ancho (3:1). Sin banner se ve un color liso de la marca.</p>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} userId={userId} color={chatColor || null} size={72} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Foto de perfil</label>
          <div className="flex flex-wrap gap-2">
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void upload("avatar", e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => avatarInput.current?.click()}>{busy === "avatar" ? "Subiendo…" : avatar ? "Cambiar foto" : "Subir foto"}</button>
            {avatar && <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy !== null} onClick={() => remove("avatar")}>Quitar</button>}
          </div>
          <p className="mt-1 text-xs text-ink-faint">Se recorta en círculo, centrada. Sin foto se ven tus iniciales con tu color.</p>
        </div>
      </div>
    </div>
  );
}
