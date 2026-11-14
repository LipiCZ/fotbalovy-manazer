import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { expectedGoals, playSeason } from '../src/engine/season.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const world = createWorld(data, 'season-test');

describe('simulace sezóny', () => {
  const season = playSeason(world);

  it('odehraje všech 5 soutěží; každý tým odehraje 2·(n−1) zápasů', () => {
    expect(season.competitions).toHaveLength(5);
    for (const cs of season.competitions) {
      const n = cs.competition.teamCount;
      expect(cs.results).toHaveLength(n * (n - 1));
      expect(cs.table).toHaveLength(n);
      for (const row of cs.table) expect(row.played, row.clubId).toBe(2 * (n - 1));
    }
  });

  it('1. liga má 30 kol, MSFL 34 kol', () => {
    const rounds = (id: string) => Math.max(...season.competitions.find((c) => c.competition.id === id)!.fixtures.map((f) => f.round));
    expect(rounds('chance-liga')).toBe(30);
    expect(rounds('msfl')).toBe(34);
  });

  it('stejný seed = stejná sezóna, jiný seed = jiná', () => {
    const tables = (s: ReturnType<typeof playSeason>) => s.competitions.map((c) => c.table);
    expect(tables(playSeason(createWorld(data, 'season-test')))).toEqual(tables(season));
    expect(tables(playSeason(world, 'jiny-seed'))).not.toEqual(tables(season));
  });

  it('silnější tým dostane bonus ke gólovému průměru, nejvýš +20 %', () => {
    const base = data.balance.simpleResults.goalsByLevel['1'];
    const even = expectedGoals(1, 65, 65, data.balance);
    expect(even).toEqual(base);
    const big = expectedGoals(1, 75, 60, data.balance);
    expect(big.home).toBeCloseTo(base.home * 1.2);
    expect(big.away).toBeCloseTo(base.away);
    const half = expectedGoals(1, 60, 64, data.balance);
    expect(half.away).toBeCloseTo(base.away * 1.1);
    expect(half.home).toBeCloseTo(base.home);
  });
});

describe('kalibrace náhodných výsledků (50 sezón)', () => {
  it('průměr gólů: 1. liga ~2,5, 3. liga ~3,2; domácí vyhrávají častěji', () => {
    const agg = new Map<number, { goals: number; n: number; home: number; away: number }>();
    for (let i = 0; i < 50; i++) {
      for (const cs of playSeason(world, `calib-${i}`).competitions) {
        const a = agg.get(cs.competition.level) ?? { goals: 0, n: 0, home: 0, away: 0 };
        for (const r of cs.results) {
          a.n++;
          a.goals += r.homeGoals + r.awayGoals;
          if (r.homeGoals > r.awayGoals) a.home++;
          if (r.homeGoals < r.awayGoals) a.away++;
        }
        agg.set(cs.competition.level, a);
      }
    }
    const l1 = agg.get(1)!;
    const l3 = agg.get(3)!;
    expect(l1.goals / l1.n).toBeGreaterThan(2.35);
    expect(l1.goals / l1.n).toBeLessThan(2.65);
    expect(l3.goals / l3.n).toBeGreaterThan(3.0);
    expect(l3.goals / l3.n).toBeLessThan(3.4);
    for (const a of agg.values()) expect(a.home).toBeGreaterThan(a.away);
  });
});
