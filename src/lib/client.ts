// fetch para los componentes de cliente: devuelve { ok, data } o { ok:false, error }
// con el mensaje que mandó la API (o uno genérico si no hubo respuesta).
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function api<T = unknown>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: (json && json.error) || "No se pudo completar la acción" };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "No hay conexión con el servidor. Probá de nuevo." };
  }
}
