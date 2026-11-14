import { describe, expect, it } from 'vitest';
import { loadDefaultData, type Balance } from '../src/engine/data.ts';
import { autoTeamSheet, type TeamSheet } from '../src/engine/lineup.ts';
import { createMatch, finishMatch, playMatch, stepMinute, type MatchContext } from '../src/engine/match/engine.ts';
import { explainMatch } from '../src/engine/match/explain.ts';
import { computeRatings } from '../src/engine/match/ratings.ts';
import type { MatchReport, PlayerMatchLine } from '../src/engine/match/types.ts';
import { Rng } from '../src/engine/rng.ts';
import type { Player } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const { balance } = data;
const world = createWorld(data, 'match-test');
const sheet = (id: string, opp = 65): TeamSheet =>
  autoTeamSheet(id, world.playersByClub.get(id) ?? [], data.tactics.formations, opp, balance);
const ctx = (seed: string, level: 1 | 2 | 3 = 1): MatchContext => ({ level, balance, formations: data.tactics.formations, rng: new Rng(seed) });

const pairs: [string, string][] = [
  ['slavia-praha', 'sparta-praha'],
  ['banik-ostrava', 'zlin'],
  ['karvina', 'dukla-praha'],
  ['havirov', 'vitkovice'],
];
const reports: MatchReport[] = [];
for (let i = 0; i < 60; i++) {
  const [h, a] = pairs[i % pairs.length]!;
  reports.push(playMatch(sheet(h), sheet(a), ctx(`m${i}`)));
}

describe('zápas – invarianty', () => {
  it('stejný seed = stejný zápas', () => {
    expect(playMatch(sheet('slavia-praha'), sheet('sparta-praha'), ctx('x'))).toEqual(
      playMatch(sheet('slavia-praha'), sheet('sparta-praha'), ctx('x')),
    );
  });

  it('skóre = počet gólových událostí = góly střelců', () => {
    for (const r of reports) {
      for (const side of ['home', 'away'] as const) {
        const goals = r.events.filter((e) => e.side === side && (e.type === 'goal' || e.type === 'penaltyGoal')).length;
        const scorers = r.players.filter((l) => l.side === side).reduce((s, l) => s + l.goals, 0);
        expect(goals).toBe(side === 'home' ? r.homeGoals : r.awayGoals);
        expect(scorers).toBe(goals);
        expect(r.stats[side].goals).toBe(goals);
      }
    }
  });

  it('statistiky dávají smysl', () => {
    for (const r of reports) {
      expect(r.stats.home.possession + r.stats.away.possession).toBe(100);
      for (const s of [r.stats.home, r.stats.away]) {
        expect(s.goals).toBeLessThanOrEqual(s.shotsOnTarget);
        expect(s.shotsOnTarget).toBeLessThanOrEqual(s.shots);
        expect(s.xg).toBeGreaterThanOrEqual(0);
        expect(s.subs).toBeLessThanOrEqual(balance.match.subs.max);
      }
      expect(r.length).toBeGreaterThanOrEqual(93);
      expect(r.length).toBeLessThanOrEqual(99);
    }
  });

  it('střídání: nejvýš 5 a nejvýš 3 okna; počet událostí sedí se statistikou', () => {
    for (const r of reports) {
      for (const side of ['home', 'away'] as const) {
        const subs = r.events.filter((e) => e.type === 'sub' && e.side === side);
        expect(subs.length).toBe(r.stats[side].subs);
        expect(new Set(subs.map((e) => e.minute)).size).toBeLessThanOrEqual(balance.match.subs.windows);
        expect(r.players.filter((l) => l.side === side && !l.started && l.minutesPlayed > 0).length).toBe(subs.length);
      }
    }
  });

  it('nikdo neodehraje víc minut, než trval zápas; střídající hráč méně', () => {
    for (const r of reports) for (const l of r.players) expect(l.minutesPlayed).toBeLessThanOrEqual(r.length);
  });

  it('po červené kartě hraje tým nejvýš v deseti', () => {
    let checked = 0;
    for (let i = 0; i < 400 && checked < 5; i++) {
      const state = createMatch(sheet('banik-ostrava'), sheet('sigma-olomouc'), ctx(`red${i}`));
      let reds = { home: 0, away: 0 };
      while (!state.finished) {
        for (const e of stepMinute(state)) if (e.type === 'red' || e.type === 'secondYellow') reds = { ...reds, [e.side]: reds[e.side] + 1 };
        for (const side of ['home', 'away'] as const) {
          const onPitch = state[side].pitch.filter(Boolean).length;
          expect(onPitch).toBeLessThanOrEqual(11 - reds[side]);
        }
      }
      if (reds.home + reds.away > 0) checked++;
      finishMatch(state);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('zraněný hráč je vystřídán a má záznam o zranění', () => {
    const injuries = reports.flatMap((r) => r.events.filter((e) => e.type === 'injury').map((e) => ({ r, e })));
    expect(injuries.length).toBeGreaterThan(0);
    for (const { r, e } of injuries) {
      const line = r.players.find((l) => l.playerId === e.playerId)!;
      expect(line.injury?.daysLeft).toBeGreaterThan(0);
      expect(line.minutesPlayed).toBeLessThanOrEqual(r.length);
    }
  });

  it('kondice během zápasu klesá, vysoký presink ji snižuje rychleji', () => {
    const endCondition = (pressing: 'low' | 'high') => {
      const home = sheet('slavia-praha');
      home.tactics = { ...home.tactics, pressing };
      const state = createMatch(home, sheet('sparta-praha'), { ...ctx('press'), autopilot: { home: false, away: true } });
      for (let i = 0; i < 60; i++) stepMinute(state);
      const ops = state.home.pitch.filter((o) => o !== null);
      return ops.reduce((s, o) => s + o!.condition, 0) / ops.length;
    };
    const low = endCondition('low');
    const high = endCondition('high');
    expect(low).toBeLessThan(100);
    expect(high).toBeLessThan(low - 3);
  });
});

describe('známky', () => {
  it('jsou v rozsahu 1–10 s jedním desetinným místem; hráč zápasu má nejvyšší známku', () => {
    for (const r of reports) {
      const played = r.players.filter((l) => l.minutesPlayed > 0);
      for (const l of played) {
        expect(l.rating).toBeGreaterThanOrEqual(1);
        expect(l.rating).toBeLessThanOrEqual(10);
        expect(Math.round(l.rating * 10) / 10).toBe(l.rating);
      }
      const motm = played.find((l) => l.playerId === r.manOfTheMatchId)!;
      expect(motm.rating).toBe(Math.max(...played.map((l) => l.rating)));
    }
  });

  it('počítají se podle vzorce z designu (bez šumu a výkonové složky)', () => {
    const b: Balance = structuredClone(balance);
    b.ratings.noiseSd = 0;
    b.ratings.performanceSkill = 0;
    b.ratings.performanceMean = 0;
    const p = world.players[0]!;
    const gk = world.players.find((x) => x.positions[0] === 'GK')!;
    const line = (over: Partial<PlayerMatchLine>): PlayerMatchLine => ({
      playerId: p.id, clubId: 'a', side: 'home', slot: 'ST', started: true, minutesPlayed: 96, goals: 0, assists: 0,
      keyPasses: 0, saves: 0, conceded: 0, errors: 0, yellow: 0, red: 'none', conditionEnd: 80, rating: 0, ...over,
    });
    const scorer = line({ goals: 1, assists: 1, keyPasses: 2 });
    const keeper = line({ playerId: gk.id, side: 'away', slot: 'GK', saves: 4, conceded: 2 });
    const sentOff = line({ playerId: 'p00002', side: 'away', red: 'straight', errors: 1 });
    const report = { homeGoals: 2, awayGoals: 1, players: [scorer, keeper, sentOff] } as unknown as MatchReport;
    const players = new Map<string, Player>(world.players.map((x) => [x.id, x]));
    computeRatings(report, players, b, new Rng(1));
    expect(scorer.rating).toBe(8.3); // 6 + gól 1 + asistence 0,6 + 2 klíčové přihrávky 0,4 + výhra 0,3
    expect(keeper.rating).toBe(5.7); // 6 + 4 zákroky 0,6 − 2 inkasované 0,6 − prohra 0,3
    expect(sentOff.rating).toBe(3.4); // 6 − vyloučení 1,5 − chyba ke gólu 0,8 − prohra 0,3
  });
});

describe('vysvětlení asistenta', () => {
  it('vrací 2–3 české věty s xG', () => {
    for (const r of reports.slice(0, 20)) {
      expect(r.explanation.length).toBeGreaterThanOrEqual(2);
      expect(r.explanation.length).toBeLessThanOrEqual(3);
      expect(r.explanation[0]).toMatch(/xG \d+,\d : \d+,\d/);
    }
    expect(explainMatch(reports[0]!)).toEqual(reports[0]!.explanation);
  });
});
