// Positions of formation slots on the pitch drawing (percent of width/height; own goal at the bottom).

import type { Position } from '../engine/types.ts';

const Y: Record<Position, number> = { GK: 91, CB: 75, LB: 70, RB: 70, DM: 59, CM: 48, LM: 44, RM: 44, AM: 32, LW: 25, RW: 25, ST: 12 };
const FIXED_X: Partial<Record<Position, number>> = { LB: 11, RB: 89, LM: 11, RM: 89, LW: 15, RW: 85, GK: 50 };
const SPREAD: Partial<Record<Position, number>> = { CB: 25, DM: 26, CM: 26, AM: 26, ST: 26 };

export function slotCoordinates(slots: readonly Position[]): { x: number; y: number }[] {
  const counts = new Map<Position, number>();
  for (const s of slots) counts.set(s, (counts.get(s) ?? 0) + 1);
  const seen = new Map<Position, number>();
  return slots.map((s) => {
    const i = seen.get(s) ?? 0;
    seen.set(s, i + 1);
    const n = counts.get(s) ?? 1;
    const x = FIXED_X[s] ?? 50 + (i - (n - 1) / 2) * (SPREAD[s] ?? 24);
    return { x, y: Y[s] };
  });
}
