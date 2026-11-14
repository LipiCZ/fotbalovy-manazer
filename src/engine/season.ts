// Season simulation for phase 1: fixtures + simple random results (Poisson goals),
// mildly adjusted by squad strength. The real match engine comes in phase 2.

import type { Balance } from './data.ts';
import { Rng } from './rng.ts';
import { doubleRoundRobin } from './schedule.ts';
import { computeTable } from './table.ts';
import type { Competition, CompetitionId, Fixture, Level, MatchResult, TableRow } from './types.ts';
import { teamStrength, type World } from './world.ts';

export interface CompetitionSeason {
  competition: Competition;
  clubIds: string[];
  fixtures: Fixture[];
  results: MatchResult[];
  table: TableRow[];
  strength: Map<string, number>;
}

export interface SeasonResult {
  seed: string;
  seasonYear: number;
  competitions: CompetitionSeason[];
}

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

export function playCompetitionSeason(world: World, competitionId: CompetitionId, rng: Rng): CompetitionSeason {
  const competition = world.data.competitions.find((c) => c.id === competitionId);
  if (!competition) throw new Error(`Neznámá soutěž ${competitionId}`);
  const clubIds = world.data.clubs.filter((c) => c.competitionId === competitionId).map((c) => c.id);
  const strength = new Map(clubIds.map((id) => [id, teamStrength(world, id)]));

  const fixtures = doubleRoundRobin(clubIds, rng.fork('draw'));
  const matchRng = rng.fork('matches');
  const results = fixtures.map((f) => simulateSimpleMatch(f, competition.level, strength, world.data.balance, matchRng));
  const table = computeTable(clubIds, results, competition, `${rng.seed}/lot`);
  return { competition, clubIds, fixtures, results, table, strength };
}

/** Plays the regular season of every competition. Deterministic for a given world + seed. */
export function playSeason(world: World, seed: string | number = world.seed): SeasonResult {
  const rng = new Rng(`${seed}/season-${world.seasonYear}`);
  return {
    seed: String(seed),
    seasonYear: world.seasonYear,
    competitions: world.data.competitions.map((c) => playCompetitionSeason(world, c.id, rng.fork(c.id))),
  };
}
