// Orden manual de tickets con un número de punto flotante ("rank"). Insertar
// entre dos vecinos es el promedio de sus ranks; solo hay que rebalancear si
// después de muchas inserciones el hueco se vuelve demasiado chico.

export const RANK_STEP = 1024;
const MIN_GAP = 1e-6;

// prev = rank del vecino de arriba (null si va primero), next = vecino de abajo
// (null si va último).
export function rankBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return RANK_STEP;
  if (prev == null) return (next as number) - RANK_STEP;
  if (next == null) return prev + RANK_STEP;
  return (prev + next) / 2;
}

export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev == null || next == null) return false;
  return Math.abs(next - prev) < MIN_GAP;
}

// Reasigna ranks parejos a una lista ya ordenada de ids.
export function rebalance(ids: string[]): Array<{ id: string; rank: number }> {
  return ids.map((id, index) => ({ id, rank: (index + 1) * RANK_STEP }));
}

export function compareByRank<T extends { rank: number; createdAt?: Date | string }>(a: T, b: T): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return at - bt;
}
