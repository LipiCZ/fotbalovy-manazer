import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng.ts';
import { doubleRoundRobin, roundCount, singleRoundRobin } from '../src/engine/schedule.ts';
import type { Fixture } from '../src/engine/types.ts';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

/** Longest run of consecutive home (or away) games of a team. */
function longestRun(fixtures: Fixture[], team: string): number {
  const venues = fixtures
    .filter((f) => f.homeId === team || f.awayId === team)
    .sort((a, b) => a.round - b.round)
    .map((f) => f.homeId === team);
  let best = 0;
  let run = 0;
  venues.forEach((home, i) => {
    run = i > 0 && venues[i - 1] === home ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

describe.each([4, 6, 16, 18])('dvoukolový rozpis pro %i týmů', (n) => {
  const ids = teams(n);
  const fixtures = doubleRoundRobin(ids, new Rng(`schedule-${n}`));

  it('má 2·(n−1) kol a n·(n−1) zápasů', () => {
    expect(roundCount(fixtures)).toBe(2 * (n - 1));
    expect(fixtures).toHaveLength(n * (n - 1));
  });

  it('každá dvojice se potká právě dvakrát, jednou doma a jednou venku', () => {
    const count = new Map<string, number>();
    for (const f of fixtures) count.set(`${f.homeId}>${f.awayId}`, (count.get(`${f.homeId}>${f.awayId}`) ?? 0) + 1);
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        expect(count.get(`${a}>${b}`), `${a} doma proti ${b}`).toBe(1);
      }
  });

  it('každý tým hraje v každém kole právě jednou', () => {
    for (let r = 1; r <= roundCount(fixtures); r++) {
      const inRound = fixtures.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
      expect(inRound).toHaveLength(n);
      expect(new Set(inRound).size).toBe(n);
    }
  });

  it('doma i venku hraje každý tým n−1 zápasů', () => {
    for (const t of ids) {
      expect(fixtures.filter((f) => f.homeId === t)).toHaveLength(n - 1);
      expect(fixtures.filter((f) => f.awayId === t)).toHaveLength(n - 1);
    }
  });

  it('nikdo nehraje víc než 2× za sebou doma ani venku', () => {
    for (const t of ids) expect(longestRun(fixtures, t), t).toBeLessThanOrEqual(2);
  });

  it('v každé polovině se každá dvojice potká jednou', () => {
    const half = n - 1;
    for (const part of [fixtures.filter((f) => f.round <= half), fixtures.filter((f) => f.round > half)]) {
      const pairs = new Set(part.map((f) => [f.homeId, f.awayId].sort().join('-')));
      expect(pairs.size).toBe((n * (n - 1)) / 2);
      expect(part).toHaveLength((n * (n - 1)) / 2);
    }
  });
});

describe('rozpis – další vlastnosti', () => {
  it('lichý počet týmů: každý má v každé polovině jedno volno', () => {
    const ids = teams(5);
    const fixtures = doubleRoundRobin(ids, new Rng(1));
    expect(roundCount(fixtures)).toBe(10);
    expect(fixtures).toHaveLength(20);
    for (const t of ids) {
      const rounds = fixtures.filter((f) => f.homeId === t || f.awayId === t).map((f) => f.round);
      expect(rounds).toHaveLength(8);
      expect(new Set(rounds).size).toBe(8);
    }
  });

  it('stejný seed = stejný rozpis, jiný seed = jiný los', () => {
    const ids = teams(16);
    expect(doubleRoundRobin(ids, new Rng('a'))).toEqual(doubleRoundRobin(ids, new Rng('a')));
    expect(doubleRoundRobin(ids, new Rng('a'))).not.toEqual(doubleRoundRobin(ids, new Rng('b')));
  });

  it('odmítne duplicitní týmy a méně než 2 týmy', () => {
    expect(() => singleRoundRobin(['a', 'a'])).toThrow();
    expect(() => singleRoundRobin(['a'])).toThrow();
  });
});
