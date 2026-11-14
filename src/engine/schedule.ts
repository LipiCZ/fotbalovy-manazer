// Double round-robin schedule (circle method / Berger tables).
//
// First half: circle method with alternating home/away, which gives the minimum number of
// "breaks" (two home or two away games in a row) and never more than 2 in a row.
// Second half: the first half with home/away swapped, rotated by one round (it starts with the
// return of round 2 and ends with the return of round 1). A plain mirror would create runs of
// three home/away games at the turn of the halves; the rotation avoids that.

import type { Rng } from './rng.ts';
import type { Fixture } from './types.ts';

type Pair = [home: string, away: string];

/** Single round-robin rounds for the given team order. Odd team counts get a bye each round. */
export function singleRoundRobin(teamIds: readonly string[]): Pair[][] {
  if (teamIds.length < 2) throw new Error('Rozpis potřebuje aspoň 2 týmy');
  if (new Set(teamIds).size !== teamIds.length) throw new Error('Rozpis: duplicitní týmy');

  const BYE = null;
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const m = n - 1; // rotating teams; teams[m] is fixed
  const fixed = teams[m] as string | null;
  const rounds: Pair[][] = [];

  for (let r = 0; r < m; r++) {
    const round: Pair[] = [];
    const rotating = teams[r] as string | null;
    const firstPair: [string | null, string | null] = r % 2 === 0 ? [rotating, fixed] : [fixed, rotating];
    const candidates: [string | null, string | null][] = [firstPair];
    for (let i = 1; i < n / 2; i++) {
      const a = teams[(r + i) % m] as string | null;
      const b = teams[(r - i + m) % m] as string | null;
      candidates.push(i % 2 === 1 ? [a, b] : [b, a]);
    }
    for (const [h, a] of candidates) if (h !== BYE && a !== BYE) round.push([h, a]);
    rounds.push(round);
  }
  return rounds;
}

/**
 * Double round-robin fixtures (each pair meets twice, once at home each).
 * The draw (team order) is randomised with rng; rounds are numbered from 1.
 */
export function doubleRoundRobin(teamIds: readonly string[], rng: Rng): Fixture[] {
  const first = singleRoundRobin(rng.shuffle(teamIds));
  const second = [...first.slice(1), ...first.slice(0, 1)].map((round) =>
    round.map(([h, a]): Pair => [a, h]),
  );
  const fixtures: Fixture[] = [];
  [...first, ...second].forEach((round, idx) => {
    for (const [homeId, awayId] of round) fixtures.push({ round: idx + 1, homeId, awayId });
  });
  return fixtures;
}

export function roundCount(fixtures: readonly Fixture[]): number {
  return fixtures.reduce((max, f) => Math.max(max, f.round), 0);
}
