import "server-only";
import sharp from "sharp";

// Foto de perfil y banner: se leen como imagen real (no se confía en el tipo que diga el
// navegador), se giran según la cámara, se recortan al centro y se recodifican a WebP,
// quitando metadatos (ubicación, cámara). Así no se guarda ni sirve nada que no sea una imagen.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_KINDS = { AVATAR: { w: 320, h: 320 }, BANNER: { w: 1400, h: 420 } } as const;
export type ImageKind = keyof typeof IMAGE_KINDS;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

export async function processProfileImage(input: Buffer, kind: ImageKind): Promise<{ data: Buffer; mimeType: string }> {
  const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error("FORMAT");
  const { w, h } = IMAGE_KINDS[kind];
  const data = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(w, h, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  return { data, mimeType: "image/webp" };
}
