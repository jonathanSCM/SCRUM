import { NextResponse, type NextRequest } from "next/server";
import { isAllowedForToken } from "@/lib/aiAccess";

// Las peticiones con "Authorization: Bearer …" (tokens IA) solo pasan por las rutas
// de la lista cerrada de src/lib/aiAccess.ts. Las de navegador (cookie de sesión) no se tocan.
export function middleware(req: NextRequest) {
  const authz = req.headers.get("authorization");
  if (!authz || !/^bearer\s/i.test(authz)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (!isAllowedForToken(req.method, pathname)) {
    return NextResponse.json({ error: "Esta acción no está permitida con un token IA." }, { status: 403 });
  }
  // Se pasa la ruta al servidor para el registro privado del token (se pisa cualquier valor que venga de afuera).
  const headers = new Headers(req.headers);
  headers.set("x-token-route", `${req.method} ${pathname}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
