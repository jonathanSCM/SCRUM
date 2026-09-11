// Llama de vuelta al panel interno usando un token personal generado ahí
// (Configuración → Token IA) -- mismo mecanismo que ya usa el panel interno
// para que un asistente de IA actúe en nombre de un usuario, acá se usa al
// revés: SCRUM ProShop actúa en nombre de quien puso el token.
export function isMainPanelConfigured() {
  return !!(process.env.MAIN_PANEL_URL && process.env.MAIN_PANEL_API_TOKEN);
}

export async function mainPanelFetch(path: string, init?: RequestInit) {
  const url = process.env.MAIN_PANEL_URL;
  const token = process.env.MAIN_PANEL_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "MAIN_PANEL_URL / MAIN_PANEL_API_TOKEN no están configurados -- no se puede editar desde acá todavía."
    );
  }

  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
