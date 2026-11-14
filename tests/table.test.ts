import { describe, expect, it } from 'vitest';
import { computeTable, type TableRules } from '../src/engine/table.ts';
import type { MatchResult } from '../src/engine/types.ts';

const rules: TableRules = {
  pointsForWin: 3,
  pointsForDraw: 1,
  tiebreakers: ['points', 'h2hPoints', 'h2hGoalDiff', 'h2hGoalsFor', 'goalDiff', 'goalsFor', 'lot'],
};
const overallOnly: TableRules = { ...rules, tiebreakers: ['points', 'goalDiff', 'goalsFor', 'lot'] };

let round = 0;
const m = (homeId: string, homeGoals: number, awayGoals: number, awayId: string): MatchResult => ({
  round: ++round,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
});
const order = (rows: { clubId: string }[]) => rows.map((r) => r.clubId);

describe('tabulka – součty', () => {
  const results = [m('A', 2, 1, 'B'), m('B', 0, 0, 'C'), m('C', 3, 1, 'A'), m('B', 4, 0, 'A')];
  const table = computeTable(['A', 'B', 'C'], results, rules);
  const row = (id: string) => table.find((r) => r.clubId === id)!;

  it('počítá body, výhry, remízy, prohry a skóre', () => {
    expect(row('A')).toMatchObject({ played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 8, goalDiff: -5, points: 3 });
    expect(row('B')).toMatchObject({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 2, goalDiff: 3, points: 4 });
    expect(row('C')).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDiff: 2, points: 4 });
  });

  it('součty sedí: výhry = prohry, vstřelené = obdržené, body = 3·rozhodnuté + 2·remízy', () => {
    const sum = (k: 'won' | 'lost' | 'drawn' | 'goalsFor' | 'goalsAgainst' | 'points' | 'played') =>
      table.reduce((s, r) => s + r[k], 0);
    expect(sum('won')).toBe(sum('lost'));
    expect(sum('goalsFor')).toBe(sum('goalsAgainst'));
    expect(sum('played')).toBe(2 * results.length);
    const draws = results.filter((r) => r.homeGoals === r.awayGoals).length;
    expect(sum('points')).toBe(3 * (results.length - draws) + 2 * draws);
  });

  it('řadí podle bodů; při rovnosti B a C rozhoduje vzájemný zápas (remíza) a pak celkové skóre', () => {
    expect(order(table)).toEqual(['B', 'C', 'A']);
  });

  it('obsahuje i tým bez odehraného zápasu', () => {
    const t = computeTable(['A', 'B', 'X'], [m('A', 1, 0, 'B')], rules);
    expect(t.find((r) => r.clubId === 'X')).toMatchObject({ played: 0, points: 0 });
  });
});

describe('tabulka – rozhodování při rovnosti bodů', () => {
  // A a B mají po 3 bodech. A vyhrál vzájemný zápas, B má lepší celkové skóre.
  const results = [m('A', 1, 0, 'B'), m('B', 6, 0, 'D'), m('A', 0, 1, 'C'), m('C', 0, 0, 'D')];

  it('vzájemný zápas má přednost před celkovým skóre', () => {
    expect(order(computeTable(['A', 'B', 'C', 'D'], results, rules))).toEqual(['C', 'A', 'B', 'D']);
  });

  it('bez vzájemných kritérií rozhoduje celkové skóre', () => {
    expect(order(computeTable(['A', 'B', 'C', 'D'], results, overallOnly))).toEqual(['C', 'B', 'A', 'D']);
  });

  it('do minitabulky se počítají jen zápasy mezi týmy se stejným počtem bodů', () => {
    // Trojice A, B, C s 6 body; mezi sebou "dokola" 1:0, takže minitabulka je vyrovnaná.
    // Rozhodne celkové skóre, které tvoří zápasy s D.
    const r = [
      m('A', 1, 0, 'B'),
      m('B', 1, 0, 'C'),
      m('C', 1, 0, 'A'),
      m('A', 3, 0, 'D'),
      m('B', 2, 0, 'D'),
      m('C', 1, 0, 'D'),
    ];
    expect(order(computeTable(['C', 'B', 'A', 'D'], r, rules))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ve trojici rozhodne rozdíl skóre z minitabulky', () => {
    // A, B, C po 6 bodech. Mezi sebou: A 3:0 B, B 1:0 C, C 1:0 A -> minitabulka GD: A +2, C 0, B −2.
    // Celkově (s výhrami nad D 1:0, 6:0, 4:0) má ale A nejhorší skóre: A +3, B +4, C +4.
    const r = [m('A', 3, 0, 'B'), m('B', 1, 0, 'C'), m('C', 1, 0, 'A'), m('A', 1, 0, 'D'), m('B', 6, 0, 'D'), m('C', 4, 0, 'D')];
    const t = computeTable(['A', 'B', 'C', 'D'], r, rules);
    expect(t.slice(0, 3).every((row) => row.points === 6)).toBe(true);
    expect(order(t).slice(0, 3)).toEqual(['A', 'C', 'B']);
    expect(order(computeTable(['A', 'B', 'C', 'D'], r, overallOnly)).slice(0, 3)).not.toEqual(['A', 'C', 'B']);
  });

  it('úplná shoda se rozhodne losem deterministicky podle seedu', () => {
    const ids = ['X', 'Y'];
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const a = order(computeTable(ids, [], rules, `seed-${i}`));
      expect(order(computeTable(ids, [], rules, `seed-${i}`))).toEqual(a);
      orders.add(a.join(','));
    }
    expect(orders).toEqual(new Set(['X,Y', 'Y,X']));
  });

  it('odmítne výsledek týmu, který není v soutěži', () => {
    expect(() => computeTable(['A', 'B'], [m('A', 1, 0, 'Z')], rules)).toThrow();
  });
});
