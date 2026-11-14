import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import type { MatchReport, PlayerMatchLine } from '../src/engine/match/types.ts';
import { Rng } from '../src/engine/rng.ts';
import { daysBetween } from '../src/engine/game/calendar.ts';
import { applyMatchToPlayers, expectedGoals, passDays, playSeason } from '../src/engine/season.ts';
import type { Player } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const { balance } = data;
const world = createWorld(data, 'season-test');
const before = structuredClone(world.players);
const season = playSeason(world, 'season-test', { keepReports: true });

describe('simulace sezóny', () => {
  it('odehraje všech 5 soutěží; každý tým odehraje 2·(n−1) zápasů', () => {
    expect(season.competitions).toHaveLength(5);
    for (const cs of season.competitions) {
      const n = cs.competition.teamCount;
      expect(cs.results).toHaveLength(n * (n - 1));
      expect(cs.reports).toHaveLength(n * (n - 1));
      for (const row of cs.table) expect(row.played, row.clubId).toBe(2 * (n - 1));
    }
  });

  it('nemění vstupní svět', () => {
    expect(world.players).toEqual(before);
  });

  it('stejný seed = stejná sezóna, jiný seed = jiná', () => {
    const tables = (s: ReturnType<typeof playSeason>) => s.competitions.map((c) => c.table);
    expect(tables(playSeason(createWorld(data, 'season-test'), 'season-test'))).toEqual(tables(season));
    expect(tables(playSeason(world, 'jiny-seed'))).not.toEqual(tables(season));
  });

  it('forma: hráči, kteří hráli, mají uložené známky (nejvýš 10)', () => {
    const withRatings = season.players.filter((p) => p.state.recentRatings.length > 0);
    expect(withRatings.length).toBeGreaterThan(season.players.length * 0.6);
    for (const p of season.players) expect(p.state.recentRatings.length).toBeLessThanOrEqual(balance.form.historyLength);
  });
});

/** Matches of a club in round order, with the player lines. */
function clubTimeline(clubId: string): { round: number; date: string; lines: PlayerMatchLine[]; report: MatchReport }[] {
  const out: { round: number; date: string; lines: PlayerMatchLine[]; report: MatchReport }[] = [];
  for (const cs of season.competitions)
    cs.reports!.forEach((r, i) => {
      if (r.homeId === clubId || r.awayId === clubId)
        out.push({ round: cs.results[i]!.round, date: cs.summaries[i]!.date, lines: r.players.filter((l) => l.clubId === clubId), report: r });
    });
  return out.sort((a, b) => a.round - b.round);
}

describe('zranění a tresty mezi koly', () => {
  const clubs = data.clubs.map((c) => c.id);
  const timelines = new Map(clubs.map((id) => [id, clubTimeline(id)]));
  const appears = (lines: PlayerMatchLine[], id: string) => lines.some((l) => l.playerId === id);
  // In the sheet = in the starting XI or on the bench; lines exist only for players who played.

  it('zraněný hráč nehraje, dokud se nevyléčí (podle dnů v kalendáři)', () => {
    let checked = 0;
    for (const [, tl] of timelines) {
      tl.forEach((m, idx) => {
        for (const l of m.lines) {
          if (!l.injury) continue;
          for (const next of tl.slice(idx + 1)) {
            if (daysBetween(m.date, next.date) >= l.injury.daysLeft) break;
            expect(appears(next.lines, l.playerId), `${l.playerId} zraněný ${m.date}`).toBe(false);
            checked++;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('po 4. žluté kartě a po vyloučení hráč vynechá další zápas', () => {
    let checked = 0;
    for (const [, tl] of timelines) {
      const yellows = new Map<string, number>();
      tl.forEach((m, idx) => {
        const next = tl[idx + 1];
        for (const l of m.lines) {
          let banned = l.red !== 'none';
          if (l.red !== 'secondYellow' && l.yellow > 0) {
            const total = (yellows.get(l.playerId) ?? 0) + l.yellow;
            yellows.set(l.playerId, total);
            if (total % balance.discipline.yellowsPerBan === 0) banned = true;
          }
          if (banned && next) {
            expect(appears(next.lines, l.playerId), `${l.playerId} má stopku po ${m.round}. kole`).toBe(false);
            checked++;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('stav hráče', () => {
  const player = (): Player => structuredClone(world.players[0]!);
  const report = (line: Partial<PlayerMatchLine>, p: Player): MatchReport =>
    ({
      players: [
        {
          playerId: p.id, clubId: p.clubId, side: 'home', slot: 'ST', started: true, minutesPlayed: 90, goals: 0,
          assists: 0, keyPasses: 0, saves: 0, conceded: 0, errors: 0, yellow: 0, red: 'none', conditionEnd: 74, rating: 6.8,
          ...line,
        },
      ],
    }) as unknown as MatchReport;
  const apply = (p: Player, line: Partial<PlayerMatchLine>) => applyMatchToPlayers(report(line, p), new Map([[p.id, p]]), balance, new Rng(1));

  it('4. žlutá = stopka na 1 zápas, 3. žlutá ne', () => {
    const p = player();
    p.state.yellowCards = 2;
    apply(p, { yellow: 1 });
    expect(p.state).toMatchObject({ yellowCards: 3, suspensionMatches: 0 });
    apply(p, { yellow: 1 });
    expect(p.state).toMatchObject({ yellowCards: 4, suspensionMatches: 1 });
  });

  it('druhá žlutá: stopka 1 zápas, žluté se do kumulace nepočítají', () => {
    const p = player();
    p.state.yellowCards = 3;
    apply(p, { yellow: 2, red: 'secondYellow' });
    expect(p.state).toMatchObject({ yellowCards: 3, suspensionMatches: 1 });
  });

  it('přímá červená: stopka 1–3 zápasy', () => {
    const p = player();
    apply(p, { red: 'straight' });
    expect(p.state.suspensionMatches).toBeGreaterThanOrEqual(1);
    expect(p.state.suspensionMatches).toBeLessThanOrEqual(3);
  });

  it('kondice, forma a zranění se uloží; dny léčí a regenerují', () => {
    const p = player();
    apply(p, { injury: { type: 'natržený sval', daysLeft: 12 } });
    expect(p.state.condition).toBe(74);
    expect(p.state.recentRatings).toEqual([6.8]);
    expect(p.state.injury).toEqual({ type: 'natržený sval', daysLeft: 12 });
    passDays([p], 7, balance);
    expect(p.state.condition).toBe(100);
    expect(p.state.injury?.daysLeft).toBe(5);
    expect(passDays([p], 7, balance)).toEqual([p]); // vrací uzdravené hráče
    expect(p.state.injury).toBeUndefined();
  });
});

describe('jednoduché výsledky z fáze 1 (pro nesimulované nižší soutěže)', () => {
  it('silnější tým dostane bonus ke gólovému průměru, nejvýš +20 %', () => {
    const base = balance.simpleResults.goalsByLevel['1'];
    expect(expectedGoals(1, 65, 65, balance)).toEqual(base);
    const big = expectedGoals(1, 75, 60, balance);
    expect(big.home).toBeCloseTo(base.home * 1.2);
    expect(big.away).toBeCloseTo(base.away);
  });
});
