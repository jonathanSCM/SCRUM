import { NextResponse } from "next/server";
import { IssueError } from "@/lib/issues";

// Convierte los errores "esperados" (IssueError) en respuestas JSON y deja
// registrado cualquier otro error inesperado.
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof IssueError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[api] error inesperado:", error);
  return NextResponse.json({ error: "Algo salió mal. Probá de nuevo." }, { status: 500 });
}

export function notFound(message = "No encontrado"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}
