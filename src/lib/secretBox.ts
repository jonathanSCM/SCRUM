import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifrado en reposo para claves de terceros guardadas por equipo (AES-256-GCM).
// La llave sale de SECRETS_KEY (o, si no existe, de NEXTAUTH_SECRET). Si cambia, las claves guardadas
// dejan de poder leerse y hay que volver a cargarlas.
function key(): Buffer {
  const base = process.env.SECRETS_KEY || process.env.NEXTAUTH_SECRET;
  if (!base) throw new Error("Falta SECRETS_KEY o NEXTAUTH_SECRET para cifrar claves");
  return createHash("sha256").update(base).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const [v, iv, tag, data] = blob.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
