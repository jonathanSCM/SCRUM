import { prisma } from "@/lib/prisma";

// Dónde viven los archivos del chat. Hoy en la base de datos (ChatFile.data);
// cuando pesen demasiado se cambia SOLO este archivo por un almacenamiento
// compatible con S3 (MinIO en Coolify, Cloudflare R2, Backblaze B2) sin tocar
// el resto de la app.

export type StoredFile = { filename: string; mimeType: string; size: number; data: Uint8Array };

export async function putChatFile(input: StoredFile & { uploadedById: string; workspaceId: string }): Promise<string> {
  const row = await prisma.chatFile.create({
    data: { filename: input.filename, mimeType: input.mimeType, size: input.size, data: input.data as Uint8Array<ArrayBuffer>, uploadedById: input.uploadedById, workspaceId: input.workspaceId },
    select: { id: true },
  });
  return row.id;
}

export async function getChatFile(id: string): Promise<StoredFile | null> {
  const row = await prisma.chatFile.findUnique({ where: { id } });
  return row ? { filename: row.filename, mimeType: row.mimeType, size: row.size, data: new Uint8Array(row.data) } : null;
}
