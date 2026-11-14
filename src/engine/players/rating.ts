// TS, FS and CEL computed from detailed attributes (design, section 11).
// TS/FS are weighted averages of attributes; the weights depend on the position the player
// plays, so the same player has a different TS/FS/CEL in another slot.

import type { Balance } from '../data.ts';
import type { AttributeId, Player, Position } from '../types.ts';

type WithAttributes = Pick<Player, 'attributes'>;

function weighted(player: WithAttributes, weights: Partial<Record<AttributeId, number>>): number {
  let sum = 0;
  for (const key in weights) sum += (weights[key as AttributeId] as number) * player.attributes[key as AttributeId];
  return sum;
}

/** Technical ability (TS) when playing at `pos`. Not rounded. */
export function tsAt(player: WithAttributes, pos: Position, balance: Balance): number {
  return weighted(player, balance.attributes.weights[pos].tech);
}

/** Physical ability (FS) when playing at `pos`. Not rounded. */
export function fsAt(player: WithAttributes, pos: Position, balance: Balance): number {
  return weighted(player, balance.attributes.weights[pos].phys);
}

/** Overall (CEL) when playing at `pos`. Not rounded. */
export function celAt(player: WithAttributes, pos: Position, balance: Balance): number {
  const w = balance.rating.byPosition[pos];
  return w.ts * tsAt(player, pos, balance) + w.fs * fsAt(player, pos, balance);
}

function mainPosition(player: Pick<Player, 'positions'>): Position {
  const main = player.positions[0];
  if (!main) throw new Error('Hráč nemá žádnou pozici');
  return main;
}

/** TS shown in the squad list (main position, rounded). */
export function ts(player: Pick<Player, 'attributes' | 'positions'>, balance: Balance): number {
  return Math.round(tsAt(player, mainPosition(player), balance));
}

/** FS shown in the squad list (main position, rounded). */
export function fs(player: Pick<Player, 'attributes' | 'positions'>, balance: Balance): number {
  return Math.round(fsAt(player, mainPosition(player), balance));
}

/** CEL shown in the squad list (main position, rounded). */
export function overall(player: Pick<Player, 'attributes' | 'positions'>, balance: Balance): number {
  return Math.round(celAt(player, mainPosition(player), balance));
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
