import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { createGameState, finalStandings, playToSeasonEnd, seasonComplete } from '../src/engine/game/advance.ts';
import { cupLevel } from '../src/engine/game/cup.ts';
import { barrageOutcomes, groupTable, knockoutWinner, regularTable, stageOf } from '../src/engine/game/postseason.ts';
import type { MatchSummary } from '../src/engine/game/state.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const p = data.pyramid.firstLeague;
const state = createGameState(createWorld(data, 'nadstavba'), { seed: 'nadstavba', userClubId: null });
playToSeasonEnd(state, data);

const summary = (o: Partial<MatchSummary>): MatchSummary => ({ round: 1, homeId: 'a', awayId: 'b', homeGoals: 0, awayGoals: 0, date: 'x', stats: {} as MatchSummary['stats'], ratingSum: 0, ratingCount: 0, injuries: 0, scorers: [], ...o });

describe('vítěz vyřazovacího zápasu', () => {
  it('jeden zápas, penalty, součet dvou zápasů', () => {
    expect(knockoutWinner([summary({ homeGoals: 2, awayGoals: 1 })])).toBe('a');
    expect(knockoutWinner([summary({ homeGoals: 1, awayGoals: 1, penalties: [3, 4] })])).toBe('b');
    expect(knockoutWinner([summary({ homeId: 'b', awayId: 'a', homeGoals: 2, awayGoals: 0 }), summary({ round: 2, homeGoals: 1, awayGoals: 0 })])).toBe('b');
  });
});

describe('nadstavba 1. ligy', () => {
  const regular = regularTable(state, p.id, data).map((r) => r.clubId);
  const title = stageOf(state, 'title-group')!;
  const relegation = stageOf(state, 'relegation-group')!;

  it('skupina o titul = 1.–6., o záchranu = 11.–16. ze základní části', () => {
    expect([...title.clubIds].sort()).toEqual(regular.slice(0, 6).sort());
    expect([...relegation.clubIds].sort()).toEqual(regular.slice(10, 16).sort());
  });

  it('jednokolově: každý s každým jednou, 5 kol, 15 zápasů', () => {
    for (const s of [title, relegation]) {
      expect(s.results).toHaveLength(15);
      expect(new Set(s.fixtures.map((f) => f.round)).size).toBe(5);
      const pairs = new Set(s.fixtures.map((f) => [f.homeId, f.awayId].sort().join('-')));
      expect(pairs.size).toBe(15);
    }
  });

  it('body ze základní části se přenáší', () => {
    const regularRows = regularTable(state, p.id, data);
    for (const row of groupTable(state, 'title-group', data)) {
      const before = regularRows.find((r) => r.clubId === row.clubId)!;
      expect(row.played).toBe(before.played + 5);
      expect(row.points).toBeGreaterThanOrEqual(before.points);
    }
  });

  it('play-off 7.–10.: semifinále 7.–10. a 8.–9. u lépe umístěného, pak finále', () => {
    const semi = stageOf(state, 'placement-semi')!;
    expect(semi.fixtures.map((f) => [f.homeId, f.awayId])).toEqual([
      [regular[6], regular[9]],
      [regular[7], regular[8]],
    ]);
    expect(stageOf(state, 'placement-final')!.results).toHaveLength(1);
  });

  it('konečné pořadí: 16 klubů, skupiny drží svá místa', () => {
    const order = finalStandings(state, data)[p.id]!;
    expect(new Set(order).size).toBe(16);
    expect([...order.slice(0, 6)].sort()).toEqual([...title.clubIds].sort());
    expect([...order.slice(10)].sort()).toEqual([...relegation.clubIds].sort());
    expect(order.slice(0, 6)).toEqual(groupTable(state, 'title-group', data).map((r) => r.clubId));
  });

  it('baráž: 14. a 15. proti 2. a 3. způsobilému týmu 2. ligy, dva zápasy, rozhodne součet', () => {
    const barrage = stageOf(state, 'barrage')!;
    const order = finalStandings(state, data)[p.id]!;
    const firstClubs = barrage.fixtures.filter((f) => f.leg === 2).map((f) => f.homeId);
    expect(firstClubs).toEqual([order[13], order[14]]);
    for (const f of barrage.fixtures) {
      const club = data.clubs.find((c) => c.id === (f.leg === 1 ? f.homeId : f.awayId))!;
      expect(club.parentClubId, 'B-tým nesmí do baráže').toBeUndefined();
      expect(f.knockout ?? false).toBe(f.leg === 2);
    }
    expect(barrageOutcomes(state)).toHaveLength(2);
  });
});

describe('MOL Cup', () => {
  const cup = state.cup!;
  it('hrají jen A-týmy, volné losy dostanou nejlepší kluby', () => {
    const first = cup.rounds[0]!;
    const teams = first.ties.flatMap((t) => [t.homeId, ...(t.awayId ? [t.awayId] : [])]);
    expect(teams.every((id) => !data.clubs.find((c) => c.id === id)!.parentClubId)).toBe(true);
    expect(teams).toHaveLength(62);
    const byes = first.ties.filter((t) => t.awayId === null);
    expect(byes).toHaveLength(2);
    for (const b of byes) expect(state.membership[b.homeId]).toBe('chance-liga');
  });

  it('v úvodních kolech hraje doma tým z nižší soutěže', () => {
    for (const round of cup.rounds.slice(0, data.pyramid.cup.lowerLevelAtHomeRounds))
      for (const t of round.ties) if (t.awayId) expect(cupLevel(state, data, t.homeId)).toBeGreaterThanOrEqual(cupLevel(state, data, t.awayId));
  });

  it('každé kolo polovina týmů, remízu rozhodnou penalty, finále na neutrální půdě, je vítěz', () => {
    cup.rounds.forEach((r, i) => {
      if (i > 0) expect(r.ties).toHaveLength(cup.rounds[i - 1]!.ties.length / 2);
      for (const t of r.ties) {
        if (!t.result) continue;
        if (t.result.homeGoals === t.result.awayGoals) expect(t.result.penalties).toBeDefined();
        expect(t.winnerId).toBe(knockoutWinner([t.result]));
      }
    });
    expect(cup.rounds.at(-1)!.neutral).toBe(true);
    expect(cup.winnerId).toBeDefined();
  });

  it('po sezóně je všechno dohrané', () => {
    expect(state.finished).toBe(true);
    expect(seasonComplete(state)).toBe(true);
  });
});
