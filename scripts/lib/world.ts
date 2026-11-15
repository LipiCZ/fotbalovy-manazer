// World stability over many seasons (phase 4): league strength, squads, ages, talents, goals.

import { loadDefaultData, type GameData } from '../../src/engine/data.ts';
import { createGameState, finalStandings, playToSeasonEnd } from '../../src/engine/game/advance.ts';
import { exactAge } from '../../src/engine/game/development.ts';
import { statements } from '../../src/engine/game/finance.ts';
import { startNewSeason } from '../../src/engine/game/transition.ts';
import { overall } from '../../src/engine/players/rating.ts';
import type { Level } from '../../src/engine/types.ts';
import { createWorld } from '../../src/engine/world.ts';

export interface SeasonMetrics {
  top11: Record<Level, number>;
  minSquad: number;
  maxSquad: number;
  seniors: number;
  academy: number;
  avgAge: number;
  pot85: number;
  pot78: number;
  goals: Record<Level, number>;
  homeWins3: number;
  groupSizes: number[];
  /** Average P&L result / revenue of A-teams by level. */
  resultShare: Record<Level, number>;
  /** Share of A-teams whose owner had to put money in. */
  ownerBailouts: number;
}

export function seasonMetrics(state: ReturnType<typeof createGameState>, data: GameData): SeasonMetrics {
  const b = data.balance;
  const top11: Record<Level, number[]> = { 1: [], 2: [], 3: [] };
  const goals: Record<Level, [number, number]> = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
  let home3 = 0;
  for (const [compId, ids] of Object.entries(finalStandings(state, data))) {
    const level = data.competitions.find((c) => c.id === compId)!.level;
    for (const id of ids ?? []) {
      const squad = state.players.filter((p) => p.clubId === id && !p.academy).map((p) => overall(p, b)).sort((x, y) => y - x).slice(0, 11);
      top11[level].push(squad.reduce((s, v) => s + v, 0) / Math.max(1, squad.length));
    }
    const progress = state.competitions.find((c) => c.id === compId)!;
    for (const r of progress.results) {
      goals[level][0] += r.homeGoals + r.awayGoals;
      goals[level][1]++;
      if (level === 3 && r.homeGoals > r.awayGoals) home3++;
    }
  }
  const clubs = Object.keys(state.membership);
  const sizes = clubs.map((id) => state.players.filter((p) => p.clubId === id && !p.academy).length);
  const seniors = state.players.filter((p) => !p.academy);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  const shares: Record<Level, number[]> = { 1: [], 2: [], 3: [] };
  let bailouts = 0;
  let aTeams = 0;
  for (const club of data.clubs) {
    const f = state.finances[club.id];
    const comp = state.membership[club.id];
    if (club.parentClubId || !f || !comp) continue;
    const level = data.competitions.find((c) => c.id === comp)!.level;
    const st = statements(f);
    const revenue = st.revenues.reduce((s, [, v]) => s + v, 0);
    if (revenue > 0) shares[level].push(st.result / revenue);
    aTeams++;
    if ((f.season.ownerDeposit ?? 0) > 0) bailouts++;
  }
  return {
    resultShare: { 1: mean(shares[1]), 2: mean(shares[2]), 3: mean(shares[3]) },
    ownerBailouts: bailouts / Math.max(1, aTeams),
    top11: { 1: mean(top11[1]), 2: mean(top11[2]), 3: mean(top11[3]) },
    minSquad: Math.min(...sizes),
    maxSquad: Math.max(...sizes),
    seniors: seniors.length,
    academy: state.players.length - seniors.length,
    avgAge: mean(seniors.map((p) => exactAge(p.birthDate, state.date))),
    pot85: state.players.filter((p) => p.pot >= 85).length,
    pot78: state.players.filter((p) => p.pot >= 78).length,
    goals: { 1: goals[1][0] / goals[1][1], 2: goals[2][0] / goals[2][1], 3: goals[3][0] / goals[3][1] },
    homeWins3: (100 * home3) / goals[3][1],
    groupSizes: ['cfl-a', 'cfl-b', 'msfl'].map((g) => Object.values(state.membership).filter((x) => x === g).length),
  };
}

/** Plays `seasons` seasons in one world. */
export function runWorld(seed: string, seasons: number, data: GameData = loadDefaultData()): SeasonMetrics[] {
  const state = createGameState(createWorld(data, seed), { seed, userClubId: null });
  const out: SeasonMetrics[] = [];
  for (let i = 0; i < seasons; i++) {
    playToSeasonEnd(state, data);
    out.push(seasonMetrics(state, data));
    if (i < seasons - 1) startNewSeason(state, data);
  }
  return out;
}
