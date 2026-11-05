import "server-only";
import { createHash, randomBytes } from "crypto";

// Enlace de invitación: aleatorio de alta entropía; en la base solo vive su hash SHA-256.
export const INVITE_PREFIX = "inv_";
export const generateInviteToken = () => `${INVITE_PREFIX}${randomBytes(24).toString("hex")}`;
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const inviteUrl = (token: string) => `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/invite/${token}`;
