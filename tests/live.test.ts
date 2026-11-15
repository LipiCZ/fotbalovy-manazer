import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceToNextUserMatch, beginDay, endDay, newGame, type DayInProgress } from '../src/engine/game/advance.ts';
import type { GameState } from '../src/engine/game/state.ts';
import { liveSubstitute, liveTactics, liveTeam, stepMinute } from '../src/engine/match/engine.ts';

const data = loadDefaultData();
const game = () => newGame(data, { seed: 'live', clubId: 'jablonec', managerName: 'Test' });

function toLive(g: GameState): DayInProgress {
  for (;;) {
    const day = beginDay(g, data, {}, true);
    if (!day) throw new Error('sezóna skončila');
    if (day.live) return day;
    endDay(g, data, day);
  }
}

describe('živý režim zápasu (design, sekce 4)', () => {
  it('bez zásahu dopadne stejně jako rychlý režim', () => {
    const quick = game();
    const live = game();
    for (let i = 0; i < 3; i++) {
      const q = advanceToNextUserMatch(quick, data).at(-1)!.userReport!;
      const day = toLive(live);
      while (!day.live!.match.finished) stepMinute(day.live!.match);
      const l = endDay(live, data, day).userReport!;
      expect([l.homeGoals, l.awayGoals]).toEqual([q.homeGoals, q.awayGoals]);
    }
    expect(live.players.map((p) => p.state.condition)).toEqual(quick.players.map((p) => p.state.condition));
    expect(live.finances['jablonec']!.cash).toBe(quick.finances['jablonec']!.cash);
  });

  it('střídání a změna taktiky během zápasu', () => {
    const g = game();
    const day = toLive(g);
    const m = day.live!.match;
    const side = day.live!.userSide;
    for (let i = 0; i < 30; i++) stepMinute(m);
    const t = liveTeam(m, side);
    const out = t.onPitch.find((x) => x.slot !== 'GK')!.player.id;
    const inn = t.bench.find((p) => p.positions[0] !== 'GK')!.id;
    expect(liveSubstitute(m, side, out, inn)).toBeNull();
    expect(liveTeam(m, side).onPitch.some((x) => x.player.id === inn)).toBe(true);
    expect(liveTeam(m, side).subsLeft).toBe(t.subsLeft - 1);
    liveTactics(m, side, { mentality: 'attacking' });
    expect(liveTeam(m, side).tactics.mentality).toBe('attacking');
    const result = endDay(g, data, day);
    expect(result.userReport!.players.some((l) => l.playerId === inn)).toBe(true);
    expect(g.user!.matches).toHaveLength(1);
  });
});
