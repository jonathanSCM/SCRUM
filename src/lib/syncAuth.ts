// Autenticación servidor-a-servidor para /api/sync/*: no hay sesión de
// usuario acá, solo un token fijo compartido con el panel interno
// (BOSS_PANEL_SYNC_TOKEN allá, SYNC_TOKEN acá — deben coincidir).
export function isValidSyncToken(req: Request): boolean {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  return header.slice(7).trim() === expected;
}
