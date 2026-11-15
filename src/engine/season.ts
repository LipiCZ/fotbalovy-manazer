// Season simulation without a human manager: plays every match day of all competitions with the
// match engine. It runs on the same game loop as the game itself (game/advance.ts).
// The world passed in is not mutated: the season works on a copy of the players.

import type { Balance } from './data.ts';
import { createGameState, playToSeasonEnd, tableFor } from './game/advance.ts';
import type { MatchSummary } from './game/state.ts';
import type { MatchReport } from './match/types.ts';
import type { Rng } from './rng.ts';
import type { Competition, CompetitionId, Fixture, Level, MatchResult, Player, TableRow } from './types.ts';
import type { World } from './world.ts';

export { applyMatchToPlayers, passDays } from './game/playerState.ts';
export type { MatchSummary } from './game/state.ts';

export interface CompetitionSeason {
  competition: Competition;
  clubIds: string[];
  fixtures: Fixture[];
  results: MatchResult[];
  summaries: MatchSummary[];
  reports?: MatchReport[];
  table: TableRow[];
}

export interface SeasonResult {
  seed: string;
  seasonYear: number;
  competitions: CompetitionSeason[];
  /** Players with their state at the end of the season. */
  players: Player[];
}

export interface SeasonOptions {
  /** Keep full match reports (events, player lines). Default false to save memory. */
  keepReports?: boolean;
}

// ---------------------------------------------------------------- phase 1 simple results
// Kept for non-simulated lower leagues (design, section 2); not used by the season any more.

/** Expected goals for both sides; the stronger team gets up to +maxBonus. */
export function expectedGoals(
  level: Level,
  homeStrength: number,
  awayStrength: number,
  balance: Balance,
): { home: number; away: number } {
  const cfg = balance.simpleResults;
  const base = cfg.goalsByLevel[`${level}`];
  const diff = homeStrength - awayStrength;
  const bonus = cfg.strengthBonus.maxBonus * Math.min(1, Math.abs(diff) / cfg.strengthBonus.celDiffForMaxBonus);
  return {
    home: base.home * (diff > 0 ? 1 + bonus : 1),
    away: base.away * (diff < 0 ? 1 + bonus : 1),
  };
}

export function simulateSimpleMatch(
  fixture: Fixture,
  level: Level,
  strength: Map<string, number>,
  balance: Balance,
  rng: Rng,
): MatchResult {
  const xg = expectedGoals(level, strength.get(fixture.homeId) ?? 0, strength.get(fixture.awayId) ?? 0, balance);
  return { ...fixture, homeGoals: rng.poisson(xg.home), awayGoals: rng.poisson(xg.away) };
}

// ---------------------------------------------------------------- season

/** Plays the regular season of every competition. Deterministic for a given world + seed. */
export function playSeason(world: World, seed: string | number = world.seed, options: SeasonOptions = {}): SeasonResult {
  const data = world.data;
  const state = createGameState(world, { seed, userClubId: null });
  const reports = new Map<CompetitionId, MatchReport[]>();
  playToSeasonEnd(
    state,
    data,
    options.keepReports
      ? {
          onReport: (r, id) => {
            if (id === null) return; // post-season and cup reports are not part of the league seasons
            const list = reports.get(id) ?? [];
            list.push(r);
            reports.set(id, list);
          },
        }
      : {},
  );
  return {
    seed: String(seed),
    seasonYear: world.seasonYear,
    players: state.players,
    competitions: state.competitions.map((progress) => {
      const competition = data.competitions.find((c) => c.id === progress.id) as Competition;
      return {
        competition,
        clubIds: progress.clubIds,
        fixtures: progress.fixtures,
        results: progress.results.map(({ round, homeId, awayId, homeGoals, awayGoals }) => ({ round, homeId, awayId, homeGoals, awayGoals })),
        summaries: progress.results,
        ...(options.keepReports ? { reports: reports.get(progress.id) ?? [] } : {}),
        table: tableFor(state, progress.id, data),
      };
    }),
  };
}
