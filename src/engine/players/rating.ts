import type { Balance } from '../data.ts';
import type { Player } from '../types.ts';

/** CEL (overall rating) from TS and FS, weighted by the player's main position. */
export function overall(player: Pick<Player, 'ts' | 'fs' | 'positions'>, balance: Balance): number {
  const main = player.positions[0];
  if (!main) throw new Error('Hráč nemá žádnou pozici');
  const w = balance.rating.byPosition[main];
  return Math.round(w.ts * player.ts + w.fs * player.fs);
}

/** Age in whole years on a given date (ISO strings). */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = onDate.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

/** 1 July of the season's starting year, e.g. 2026 -> '2026-07-01'. */
export function seasonStartDate(seasonYear: number): string {
  return `${seasonYear}-07-01`;
}
