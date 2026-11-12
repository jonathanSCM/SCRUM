import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Id de la compilación desplegada: Next lo escribe en .next/BUILD_ID al compilar (en desarrollo no existe y queda vacío).
let cached: string | null = null;
export function buildId(): string {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = "";
  }
  return cached;
}
