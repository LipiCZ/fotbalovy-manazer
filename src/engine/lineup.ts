// Squad selection: position fit (100/90/70 %), optimal starting XI for a formation
// (Hungarian algorithm), bench, availability and AI tactics.

import type { Balance, Formation, FormationId, Mentality, Pressing, Style } from './data.ts';
import { celAt, fsAt, tsAt } from './players/rating.ts';
import type { Player, Position } from './types.ts';

export interface Tactics {
  formation: FormationId;
  style: Style;
  mentality: Mentality;
  pressing: Pressing;
  captainId?: string;
  setPieceTakerId?: string;
}

/** Everything a team brings to a match. lineup[i] plays slot slots[i] (null = nobody available). */
export interface TeamSheet {
  clubId: string;
  slots: Position[];
  lineup: (Player | null)[];
  bench: Player[];
  tactics: Tactics;
}

export type FitKind = 'natural' | 'related' | 'foreign';

export function fitKind(player: Pick<Player, 'positions'>, slot: Position, balance: Balance): FitKind {
  if (player.positions.includes(slot)) return 'natural';
  // Goalkeeper and outfield positions are never related.
  if (slot === 'GK' || player.positions[0] === 'GK') return 'foreign';
  const related = balance.squad.relatedPositions;
  return player.positions.some((p) => related[p].includes(slot)) ? 'related' : 'foreign';
}

export function positionFit(player: Pick<Player, 'positions'>, slot: Position, balance: Balance): number {
  return balance.match.positionFit[fitKind(player, slot, balance)];
}

/** Value of a player in a slot for squad selection: CEL at the slot × position fit. */
export function slotValue(player: Player, slot: Position, balance: Balance): number {
  return celAt(player, slot, balance) * positionFit(player, slot, balance);
}

export function isAvailable(player: Player): boolean {
  return (player.state.injury?.daysLeft ?? 0) <= 0 && player.state.suspensionMatches <= 0;
}

/**
 * Hungarian algorithm (minimum cost assignment) for an n×m matrix with n <= m.
 * Returns the column assigned to each row.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = (cost[0] as number[]).length;
  if (m < n) throw new Error('hungarian: potřeba aspoň tolik sloupců jako řádků');
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0] as number;
      let delta = Infinity;
      let j1 = 0;
      const row = cost[i0 - 1] as number[];
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = (row[j - 1] as number) - (u[i0] as number) - (v[j] as number);
        if (cur < (minv[j] as number)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if ((minv[j] as number) < delta) {
          delta = minv[j] as number;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j] as number] = (u[p[j] as number] as number) + delta;
          v[j] = (v[j] as number) - delta;
        } else minv[j] = (minv[j] as number) - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0] as number;
      p[j0] = p[j1] as number;
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if ((p[j] as number) > 0) result[(p[j] as number) - 1] = j - 1;
  return result;
}

export interface LineupChoice {
  formation: FormationId;
  slots: Position[];
  lineup: (Player | null)[];
  total: number;
}

/** Optimal XI for a formation (maximises the sum of slot values). Missing players -> null. */
export function bestLineup(formation: Formation, players: readonly Player[], balance: Balance): LineupChoice {
  const slots = formation.slots;
  const cols = Math.max(players.length, slots.length);
  const cost = slots.map((slot) =>
    Array.from({ length: cols }, (_, j) => {
      const p = players[j];
      return p ? -slotValue(p, slot, balance) : 0;
    }),
  );
  const assignment = hungarian(cost);
  const lineup = assignment.map((j) => players[j] ?? null);
  const total = lineup.reduce((s, p, i) => s + (p ? slotValue(p, slots[i] as Position, balance) : 0), 0);
  return { formation: formation.id, slots: [...slots], lineup, total };
}

/** Best formation for the available players. Ties keep the order of `formations`. */
export function chooseLineup(formations: readonly Formation[], players: readonly Player[], balance: Balance): LineupChoice {
  let best: LineupChoice | undefined;
  for (const f of formations) {
    const choice = bestLineup(f, players, balance);
    if (!best || choice.total > best.total + 1e-9) best = choice;
  }
  if (!best) throw new Error('chooseLineup: žádné rozestavení');
  return best;
}

/** Bench: a backup goalkeeper first (if available), then the best remaining players by CEL. */
export function chooseBench(rest: readonly Player[], size: number, balance: Balance): Player[] {
  const byValue = [...rest].sort(
    (a, b) =>
      celAt(b, b.positions[0] as Position, balance) - celAt(a, a.positions[0] as Position, balance) ||
      a.id.localeCompare(b.id),
  );
  const bench: Player[] = [];
  const gk = byValue.find((p) => p.positions[0] === 'GK');
  if (gk) bench.push(gk);
  for (const p of byValue) {
    if (bench.length >= size) break;
    if (!bench.includes(p) && p.positions[0] !== 'GK') bench.push(p);
  }
  return bench;
}

/** Average of `fn` over the lineup (ignoring empty slots). */
function lineupAverage(choice: LineupChoice, fn: (p: Player, slot: Position) => number): number {
  let sum = 0;
  let n = 0;
  choice.lineup.forEach((p, i) => {
    if (!p) return;
    sum += fn(p, choice.slots[i] as Position);
    n++;
  });
  return n === 0 ? 0 : sum / n;
}

/** Strength of a chosen XI (average slot value), used by the AI to compare with the opponent. */
export function lineupStrength(choice: LineupChoice, balance: Balance): number {
  return lineupAverage(choice, (p, slot) => slotValue(p, slot, balance));
}

/** Simple AI: style from the squad profile, mentality from relative strength, pressing from stamina. */
export function chooseTactics(choice: LineupChoice, opponentStrength: number, balance: Balance): Tactics {
  const ai = balance.ai;
  const outfield = { ...choice, lineup: choice.lineup.map((p, i) => (choice.slots[i] === 'GK' ? null : p)) };
  const avgTs = lineupAverage(outfield, (p, s) => tsAt(p, s, balance));
  const avgFs = lineupAverage(outfield, (p, s) => fsAt(p, s, balance));
  const avgCel = lineupAverage(outfield, (p, s) => celAt(p, s, balance));
  const speed = lineupAverage(outfield, (p) => (p.attributes.pace + p.attributes.acceleration) / 2);
  const stamina = lineupAverage(outfield, (p) => p.attributes.stamina);

  const style: Style =
    speed - avgCel > ai.counterIfSpeedAboveCel ? 'counter' : avgTs - avgFs > ai.possessionIfTsAboveFs ? 'possession' : 'direct';
  const diff = lineupStrength(choice, balance) - opponentStrength;
  const mentality: Mentality =
    diff > ai.mentalityStrengthDiff ? 'attacking' : diff < -ai.mentalityStrengthDiff ? 'defensive' : 'balanced';
  const pressing: Pressing =
    stamina - avgFs > ai.pressingStaminaDiff ? 'high' : stamina - avgFs < -ai.pressingStaminaDiff ? 'low' : 'medium';

  const onPitch = choice.lineup.filter((p): p is Player => p !== null);
  const captain = [...onPitch].sort((a, b) => b.leadership - a.leadership || a.id.localeCompare(b.id))[0];
  const taker = [...onPitch].sort(
    (a, b) =>
      b.attributes.setPieces + b.attributes.finishing - (a.attributes.setPieces + a.attributes.finishing) ||
      a.id.localeCompare(b.id),
  )[0];
  return {
    formation: choice.formation,
    style,
    mentality,
    pressing,
    ...(captain ? { captainId: captain.id } : {}),
    ...(taker ? { setPieceTakerId: taker.id } : {}),
  };
}

/** Full AI team sheet from a squad. */
export function autoTeamSheet(
  clubId: string,
  squad: readonly Player[],
  formations: readonly Formation[],
  opponentStrength: number,
  balance: Balance,
): TeamSheet {
  const available = squad.filter(isAvailable).sort((a, b) => a.id.localeCompare(b.id));
  const choice = chooseLineup(formations, available, balance);
  const inXi = new Set(choice.lineup.filter((p): p is Player => p !== null).map((p) => p.id));
  const bench = chooseBench(
    available.filter((p) => !inXi.has(p.id)),
    balance.match.subs.benchSize,
    balance,
  );
  return {
    clubId,
    slots: choice.slots,
    lineup: choice.lineup,
    bench,
    tactics: chooseTactics(choice, opponentStrength, balance),
  };
}
