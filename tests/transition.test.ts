import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceDay, createGameState, finalStandings, newGame, playToSeasonEnd } from '../src/engine/game/advance.ts';
import { allowedGroups, canPlayIn, levelOfCompetition } from '../src/engine/game/pyramid.ts';
import { makeSave, parseSave, serializeSave } from '../src/engine/game/saveFormat.ts';
import { computeMovements, startNewSeason } from '../src/engine/game/transition.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const initial = Object.fromEntries(data.clubs.map((c) => [c.id, c.competitionId]));
const club = (id: string) => data.clubs.find((c) => c.id === id)!;

describe('pravidla pyramidy (design, sekce 2)', () => {
  it('B-tým ne do 1. ligy, ne na úroveň svého A-týmu, ne ke svému druhému týmu', () => {
    expect(canPlayIn(data, initial, 'slavia-praha-b', 'chance-liga')).toBe(false);
    expect(canPlayIn(data, initial, 'slavia-praha-b', 'cnl')).toBe(true);
    expect(canPlayIn(data, { ...initial, 'banik-ostrava': 'cnl' }, 'banik-ostrava-b', 'cnl')).toBe(false);
    expect(canPlayIn(data, initial, 'slavia-praha-c', 'cnl')).toBe(false); // Slavia B už v 2. lize hraje
    expect(canPlayIn(data, initial, 'kladno', 'chance-liga')).toBe(true);
  });
  it('kraje: Praha do ČFL A, Středočeský do A nebo B, Vysočina kamkoli, Morava do MSFL', () => {
    expect(allowedGroups(data, club('dukla-praha'))).toEqual(['cfl-a']);
    expect(allowedGroups(data, club('kladno'))).toEqual(['cfl-a', 'cfl-b']);
    expect(allowedGroups(data, club('vysocina-jihlava'))).toEqual(['msfl', 'cfl-a', 'cfl-b']);
    expect(allowedGroups(data, club('opava'))).toEqual(['msfl']);
  });
});

describe('přechod sezóny', () => {
  const state = createGameState(createWorld(data, 'prechod'), { seed: 'prechod', userClubId: null });
  playToSeasonEnd(state, data);
  const standings = finalStandings(state, data);
  const { membership, movements } = computeMovements(state, data);

  it('1. a 2. liga mají znovu po 16 týmech, 3. liga zůstává uzavřená', () => {
    const count = (id: string) => Object.values(membership).filter((x) => x === id).length;
    expect(count('chance-liga')).toBe(16);
    expect(count('cnl')).toBe(16);
    const third = ['cfl-a', 'cfl-b', 'msfl'].map(count);
    for (const n of third) {
      expect(n).toBeGreaterThanOrEqual(14);
      expect(n).toBeLessThanOrEqual(20);
    }
    const removed = movements.filter((m) => m.reason === 'removed').length;
    expect(Object.keys(membership)).toHaveLength(82 - removed);
  });

  it('poslední z 1. ligy sestupuje, vítěz 2. ligy (způsobilý) postupuje', () => {
    const last = standings['chance-liga']!.at(-1)!;
    expect(membership[last]).toBe('cnl');
    const winner = standings['cnl']!.find((id) => !club(id).parentClubId)!;
    expect(membership[winner]).toBe('chance-liga');
  });

  it('po přechodu všichni hrají tam, kde smějí; nováčci 3. ligy podle kraje', () => {
    for (const [id, comp] of Object.entries(membership)) expect(canPlayIn(data, membership, id, comp), `${id} v ${comp}`).toBe(true);
    for (const m of movements.filter((x) => x.to && levelOfCompetition(data, x.to) === 3 && x.from && levelOfCompetition(data, x.from) === 2))
      expect(allowedGroups(data, club(m.clubId))).toContain(membership[m.clubId]);
  });

  it('A-tým sestoupí k vlastnímu B-týmu: B-tým musí o soutěž níž', () => {
    const forced = computeMovements({ ...state, membership: { ...state.membership, 'banik-ostrava': 'cnl', 'banik-ostrava-b': 'cnl' } }, data);
    expect(forced.movements.some((m) => m.clubId === 'banik-ostrava-b' && (m.reason === 'forced' || m.reason === 'relegated'))).toBe(true);
    expect(levelOfCompetition(data, forced.membership['banik-ostrava-b']!)).toBe(3);
  });

  it('nová sezóna: rok +1, 1. 7., nový rozpis a pohár, kariéra, nábor, vynulované žluté', () => {
    const before = state.seasonYear;
    const seniors = state.players.filter((p) => !p.academy).length;
    startNewSeason(state, data);
    expect(state.seasonYear).toBe(before + 1);
    expect(state.date).toBe(`${before + 1}-07-01`);
    expect(state.finished).toBe(false);
    expect(state.stages).toEqual([]);
    expect(state.cup!.winnerId).toBeUndefined();
    expect(state.history).toHaveLength(1);
    expect(state.membership).toEqual(membership);
    for (const c of state.competitions) expect(c.clubIds.length).toBe(Object.values(membership).filter((x) => x === c.id).length);
    expect(state.playerStats).toEqual({});
    expect(state.players.every((p) => p.state.yellowCards === 0)).toBe(true);
    const archived = state.players.filter((p) => !p.academy && (p.career?.length ?? 0) === 1).length;
    expect(archived).toBeGreaterThan(seniors * 0.8);
    expect(state.players.filter((p) => p.academy).length).toBeGreaterThan(100);
    expect(new Set(state.players.map((p) => p.id)).size).toBe(state.players.length);
  });
});

describe('více sezón s manažerem a ukládání', () => {
  it('3 sezóny za sebou, uložení uprostřed nadstavby pokračuje stejně', () => {
    const g = newGame(data, { seed: 'tri-sezony', clubId: 'teplice', managerName: 'Test' });
    for (let s = 0; s < 2; s++) {
      playToSeasonEnd(g, data);
      startNewSeason(g, data);
    }
    expect(g.seasonYear).toBe(2028);
    expect(g.history).toHaveLength(2);
    // Into the post-season of the 3rd season, then save and continue both copies.
    while (!g.stages.some((s) => s.id === 'title-group')) {
      const before = g.date;
      if (!advance(g)) break;
      expect(g.date >= before).toBe(true);
    }
    const copy = parseSave(serializeSave(makeSave(g, data, 'x', 'now')), data).save.game;
    playToSeasonEnd(g, data);
    playToSeasonEnd(copy, data);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(g));
  });

  it('uložení z verze 1 (fáze 3) se převede a hra pokračuje', () => {
    const g = newGame(data, { seed: 'v1', clubId: 'karvina', managerName: 'Test' });
    const save = makeSave(g, data, 'x', 'now') as unknown as Record<string, unknown>;
    const v1 = structuredClone(save) as { version: number; game: Record<string, unknown> };
    v1.version = 1;
    for (const key of ['membership', 'stages', 'cup', 'history']) delete v1.game[key];
    const user = v1.game.user as Record<string, unknown>;
    user.reports = [];
    delete user.matches;
    delete user.training;
    const { save: migrated, warnings } = parseSave(v1, data);
    expect(warnings.join(' ')).toMatch(/převedena/);
    expect(migrated.game.membership['karvina']).toBe('cnl');
    expect(migrated.game.user!.matches).toEqual([]);
    playToSeasonEnd(migrated.game, data);
    expect(migrated.game.finished).toBe(true);
  });
});

function advance(g: Parameters<typeof advanceDay>[0]) {
  return advanceDay(g, data);
}
