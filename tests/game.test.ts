import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import {
  advanceDay,
  advanceToNextUserMatch,
  newGame,
  nextMatchDate,
  nextUserMatch,
  playToSeasonEnd,
  squadOf,
  tableFor,
} from '../src/engine/game/advance.ts';
import { daysBetween, parseDate } from '../src/engine/game/calendar.ts';
import { makeSave, parseSave, SaveError, serializeSave } from '../src/engine/game/saveFormat.ts';
import { topScorers } from '../src/engine/game/stats.ts';
import { applyAssistantLineup, changeFormation, swapPlayers } from '../src/engine/game/userTeam.ts';

const data = loadDefaultData();
const fresh = (seed = 'game-test', clubId = 'bohemians-praha-1905') => newGame(data, { seed, clubId, managerName: 'Test' });

describe('nová hra', () => {
  const g = fresh();
  it('má sestavu 11 hráčů z vlastního kádru a lavičku do 9', () => {
    const squad = new Set(squadOf(g, g.userClubId!).map((p) => p.id));
    expect(g.user!.lineup.playerIds.filter(Boolean)).toHaveLength(11);
    expect(g.user!.lineup.playerIds.every((id) => id && squad.has(id))).toBe(true);
    expect(g.user!.lineup.benchIds.length).toBeLessThanOrEqual(9);
    expect(g.date).toBe('2026-07-01');
  });
  it('B a C tým vést nejde', () => {
    expect(() => fresh('x', 'slavia-praha-b')).toThrow(/A-tým/);
  });
});

describe('kalendář', () => {
  const g = fresh();
  it('kola jsou soboty, vzestupně, mimo zimní pauzu a do 30. 6.', () => {
    for (const c of g.competitions) {
      const comp = data.competitions.find((x) => x.id === c.id)!;
      expect(c.roundDates).toHaveLength(Math.max(...c.fixtures.map((f) => f.round)));
      c.roundDates.forEach((d, i) => {
        expect(new Date(parseDate(d)).getUTCDay(), `${c.id} ${d}`).toBe(6);
        if (i > 0) expect(daysBetween(c.roundDates[i - 1]!, d)).toBeGreaterThanOrEqual(7);
        const mmdd = d.slice(5);
        const [from, to] = comp.calendar.winterBreak;
        const inBreak = from > to ? mmdd >= from || mmdd <= to : mmdd >= from && mmdd <= to;
        expect(inBreak, `${c.id} ${d} v zimní pauze`).toBe(false);
      });
      expect(c.roundDates.at(-1)! <= '2027-06-30').toBe(true);
    }
  });
  it('1. liga začíná v sobotu 25. 7. 2026', () => {
    expect(g.competitions.find((c) => c.id === 'chance-liga')!.roundDates[0]).toBe('2026-07-25');
  });
});

describe('herní smyčka', () => {
  it('Pokračovat odehraje dny až po zápas mého týmu', () => {
    const g = fresh();
    const next = nextUserMatch(g, data)!;
    expect(next.label).toBe('Chance Liga, 1. kolo');
    const days = advanceToNextUserMatch(g, data);
    const report = days.at(-1)!.userReport!;
    expect([report.homeId, report.awayId]).toContain(g.userClubId);
    expect(days.at(-1)!.date).toBe(next.date);
    expect(g.user!.matches).toHaveLength(1);
    expect(g.user!.matches[0]!.label).toBe('Chance Liga, 1. kolo');
    expect(nextUserMatch(g, data)!.round).toBe(2);
  });

  it('stejný seed = stejný průběh', () => {
    const a = fresh('det');
    const b = fresh('det');
    for (let i = 0; i < 4; i++) {
      advanceToNextUserMatch(a, data);
      advanceToNextUserMatch(b, data);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('moje rozestavení se v zápase opravdu použije', () => {
    const g = fresh('formace');
    changeFormation(g.user!, '5-3-2', squadOf(g, g.userClubId!), data);
    const report = advanceToNextUserMatch(g, data).at(-1)!.userReport!;
    const starters = report.players.filter((l) => l.clubId === g.userClubId && l.started).map((l) => l.slot).sort();
    expect(starters).toEqual([...data.tactics.formations.find((f) => f.id === '5-3-2')!.slots].sort());
  });

  it('zraněného hráče v sestavě nahradí asistent a ohlásí to', () => {
    const g = fresh('zraneni');
    const injuredId = g.user!.lineup.playerIds[3]!;
    g.players.find((p) => p.id === injuredId)!.state.injury = { type: 'natržený sval', daysLeft: 60 };
    const day = advanceToNextUserMatch(g, data).at(-1)!;
    expect(day.userReport!.players.some((l) => l.playerId === injuredId)).toBe(false);
    expect(day.news.some((n) => n.kind === 'lineup' && n.text.includes('zranění'))).toBe(true);
    expect(g.user!.lineup.playerIds).not.toContain(injuredId);
  });

  it('celá sezóna: všichni odehrají všechna kola, statistiky sedí s výsledky', () => {
    const g = fresh('cela');
    playToSeasonEnd(g, data);
    expect(g.finished).toBe(true);
    expect(nextMatchDate(g)).toBeNull();
    expect(advanceDay(g, data)).toBeNull();
    const league = g.user!.matches.filter((m) => m.label.startsWith('Chance Liga'));
    expect(league).toHaveLength(30);
    for (const c of g.competitions) {
      const n = c.clubIds.length;
      expect(c.results).toHaveLength(n * (n - 1));
      expect(tableFor(g, c.id, data).every((r) => r.played === 2 * (n - 1))).toBe(true);
    }
    // Goals of all players = goals of all matches (league, post-season, cup).
    const all = [
      ...g.competitions.flatMap((c) => c.results),
      ...g.stages.flatMap((s) => s.results),
      ...(g.cup?.rounds.flatMap((r) => r.ties.flatMap((t) => (t.result ? [t.result] : []))) ?? []),
    ];
    const goals = all.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
    const scored = Object.values(g.playerStats).reduce((s, x) => s + x.goals, 0);
    // Players who retired/left are no longer in the list, but stats are kept by id.
    expect(scored).toBe(goals);
    const top = topScorers(g, 'chance-liga', 5);
    expect(top[0]!.stats.goals).toBeGreaterThanOrEqual(top[4]!.stats.goals);
  });
});

describe('úpravy sestavy', () => {
  const g = fresh('sestava');
  const user = g.user!;
  const squad = squadOf(g, g.userClubId!);

  it('výměna dvou hráčů v sestavě a hráče s lavičkou', () => {
    const [a, b] = [user.lineup.playerIds[1], user.lineup.playerIds[2]];
    swapPlayers(user, { area: 'xi', index: 1 }, { area: 'xi', index: 2 }, data);
    expect([user.lineup.playerIds[1], user.lineup.playerIds[2]]).toEqual([b, a]);
    const benchFirst = user.lineup.benchIds[0];
    swapPlayers(user, { area: 'xi', index: 1 }, { area: 'bench', index: 0 }, data);
    expect(user.lineup.playerIds[1]).toBe(benchFirst);
    expect(user.lineup.benchIds[0]).toBe(b);
  });

  it('náhradník mimo lavičku vytlačí hráče ze sestavy do rezervy', () => {
    const used = new Set([...user.lineup.playerIds, ...user.lineup.benchIds]);
    const reserve = squad.find((p) => !used.has(p.id))!;
    const out = user.lineup.playerIds[5];
    swapPlayers(user, { area: 'reserve', playerId: reserve.id }, { area: 'xi', index: 5 }, data);
    expect(user.lineup.playerIds[5]).toBe(reserve.id);
    expect([...user.lineup.playerIds, ...user.lineup.benchIds]).not.toContain(out);
  });

  it('hráč je v sestavě i na lavičce nejvýš jednou', () => {
    swapPlayers(user, { area: 'reserve', playerId: user.lineup.benchIds[0]! }, { area: 'xi', index: 7 }, data);
    const all = [...user.lineup.playerIds, ...user.lineup.benchIds].filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it('změna rozestavení ponechá stejné hráče', () => {
    const before = [...user.lineup.playerIds].sort();
    changeFormation(user, '3-5-2', squad, data);
    expect(user.tactics.formation).toBe('3-5-2');
    expect([...user.lineup.playerIds].sort()).toEqual(before);
    expect(user.lineup.slots.filter((s) => s === 'CB')).toHaveLength(3);
  });

  it('sestava od asistenta ponechá můj styl a presink', () => {
    user.tactics = { ...user.tactics, style: 'counter', pressing: 'high' };
    applyAssistantLineup(user, squad, data);
    expect(user.tactics).toMatchObject({ style: 'counter', pressing: 'high' });
    expect(user.lineup.playerIds.filter(Boolean)).toHaveLength(11);
  });
});

describe('ukládání', () => {
  it('uložení a načtení: hra pokračuje přesně stejně', () => {
    const a = fresh('save');
    for (let i = 0; i < 3; i++) advanceToNextUserMatch(a, data);
    const text = serializeSave(makeSave(a, data, 'test', '2026-11-14T12:00:00Z'));
    const { save, warnings } = parseSave(text, data);
    expect(warnings).toEqual([]);
    const b = save.game;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    for (let i = 0; i < 3; i++) {
      advanceToNextUserMatch(a, data);
      advanceToNextUserMatch(b, data);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('metadata pro seznam uložených her', () => {
    const save = makeSave(fresh(), data, 'Slot 1', '2026-11-14T12:00:00Z');
    expect(save.meta).toMatchObject({ label: 'Slot 1', clubName: 'Bohemians Praha 1905', managerName: 'Test', date: '2026-07-01' });
  });

  it('jiná verze, cizí soubor a poškozený soubor dají srozumitelnou chybu', () => {
    const save = makeSave(fresh(), data, 'x', 'now');
    expect(() => parseSave('{nejson', data)).toThrow(SaveError);
    expect(() => parseSave({ foo: 1 }, data)).toThrow(/není uložená hra/);
    expect(() => parseSave({ ...save, version: 99 }, data)).toThrow(/verzi 99/);
    const broken = structuredClone(save);
    broken.game.players[0]!.clubId = 'atlantida';
    expect(() => parseSave(broken, data)).toThrow(/poškozená/);
    const badLineup = structuredClone(save);
    badLineup.game.user!.lineup.playerIds[0] = 'p99999';
    expect(() => parseSave(badLineup, data)).toThrow(/neznámého hráče/);
  });

  it('jiná verze herních dat jen varuje', () => {
    const save = { ...makeSave(fresh(), data, 'x', 'now'), dataHash: 'deadbeef' };
    const { warnings } = parseSave(save, data);
    expect(warnings[0]).toMatch(/jinou verzí herních dat/);
  });
});
