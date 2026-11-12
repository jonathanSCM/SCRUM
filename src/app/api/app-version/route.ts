import { NextResponse } from "next/server";
import { buildId } from "@/lib/buildId";

// Versión desplegada de la app (pública, sin datos de nadie). El navegador la compara con la que cargó para
// avisar de una versión nueva, o limpia su caché cuando se sube CACHE_VERSION.
export function GET() {
  return NextResponse.json({ build: buildId(), cache: process.env.CACHE_VERSION ?? "0" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
