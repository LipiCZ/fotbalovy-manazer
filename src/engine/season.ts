// Season simulation: all competitions round by round with the match engine (phase 2).
// Between rounds: condition recovers, injuries heal, suspensions are served, form is updated.
// The world passed in is not mutated: the season works on a copy of the players.

import type { Balance } from './data.ts';
import { chooseBench, chooseLineup, chooseTactics, isAvailable, lineupStrength, type LineupChoice, type TeamSheet } from './lineup.ts';
import { playMatch } from './match/engine.ts';
import type { MatchReport, TeamMatchStats } from './match/types.ts';
import { Rng } from './rng.ts';
import { doubleRoundRobin } from './schedule.ts';
import { computeTable } from './table.ts';
import type { Competition, CompetitionId, Fixture, Level, MatchResult, Player, TableRow } from './types.ts';
import type { World } from './world.ts';

/** Compact per-match record kept for every match (full reports only on request). */
export interface MatchSummary extends MatchResult {
  stats: { home: TeamMatchStats; away: TeamMatchStats };
  ratingSum: number;
  ratingCount: number;
  injuries: number;
}

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
// Kept for non-simulated lower leagues (design, section 2); not used by playSeason any more.

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

// ---------------------------------------------------------------- player state updates

/** Applies a finished match to the players' state (condition, form, cards, injuries). */
export function applyMatchToPlayers(report: MatchReport, players: Map<string, Player>, balance: Balance, rng: Rng): void {
  const d = balance.discipline;
  for (const line of report.players) {
    const p = players.get(line.playerId);
    if (!p) continue;
    const s = p.state;
    // Cards and injuries count even for a player who was on the pitch for no full minute.
    if (line.minutesPlayed > 0) {
      s.condition = line.conditionEnd;
      s.recentRatings.push(line.rating);
      if (s.recentRatings.length > balance.form.historyLength) s.recentRatings.splice(0, s.recentRatings.length - balance.form.historyLength);
    }

    if (line.red === 'secondYellow') {
      s.suspensionMatches += d.secondYellowBan;
    } else {
      if (line.yellow > 0) {
        s.yellowCards += line.yellow;
        if (s.yellowCards % d.yellowsPerBan === 0) s.suspensionMatches += d.yellowAccumulationBan;
      }
      if (line.red === 'straight') s.suspensionMatches += rng.weightedPick(d.straightRedBan.matches, d.straightRedBan.weights);
    }
    if (line.injury) s.injury = { ...line.injury };
  }
}

/** Days pass: condition recovers, injuries heal. */
export function passDays(players: Iterable<Player>, days: number, balance: Balance): void {
  for (const p of players) {
    const s = p.state;
    s.condition = Math.min(100, s.condition + balance.condition.recoveryPerDay * days);
    if (s.injury) {
      s.injury.daysLeft -= days;
      if (s.injury.daysLeft <= 0) delete s.injury;
    }
  }
}

// ---------------------------------------------------------------- team selection

interface CachedChoice {
  key: string;
  choice: LineupChoice;
  strength: number;
  rest: Player[];
}

function selectionFor(clubId: string, squad: Player[], world: World, cache: Map<string, CachedChoice>): CachedChoice {
  const available = squad.filter(isAvailable);
  const key = squad
    .filter((p) => !isAvailable(p))
    .map((p) => p.id)
    .join(',');
  const cached = cache.get(clubId);
  if (cached && cached.key === key) return cached;
  const { balance, tactics } = world.data;
  const choice = chooseLineup(tactics.formations, available, balance);
  const inXi = new Set(choice.lineup.filter((p): p is Player => p !== null).map((p) => p.id));
  const entry: CachedChoice = {
    key,
    choice,
    strength: lineupStrength(choice, balance),
    rest: available.filter((p) => !inXi.has(p.id)),
  };
  cache.set(clubId, entry);
  return entry;
}

function sheetFor(clubId: string, sel: CachedChoice, opponentStrength: number, balance: Balance): TeamSheet {
  return {
    clubId,
    slots: sel.choice.slots,
    lineup: sel.choice.lineup,
    bench: chooseBench(sel.rest, balance.match.subs.benchSize, balance),
    tactics: chooseTactics(sel.choice, opponentStrength, balance),
  };
}

// ---------------------------------------------------------------- season

/** Plays the regular season of every competition. Deterministic for a given world + seed. */
export function playSeason(world: World, seed: string | number = world.seed, options: SeasonOptions = {}): SeasonResult {
  const rng = new Rng(`${seed}/season-${world.seasonYear}`);
  const { balance } = world.data;
  const players = structuredClone(world.players) as Player[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const byClub = new Map<string, Player[]>();
  for (const p of players) {
    const list = byClub.get(p.clubId) ?? [];
    list.push(p);
    byClub.set(p.clubId, list);
  }
  for (const list of byClub.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const seasons: CompetitionSeason[] = world.data.competitions.map((competition) => {
    const clubIds = world.data.clubs.filter((c) => c.competitionId === competition.id).map((c) => c.id);
    return {
      competition,
      clubIds,
      fixtures: doubleRoundRobin(clubIds, rng.fork(competition.id).fork('draw')),
      results: [],
      summaries: [],
      ...(options.keepReports ? { reports: [] } : {}),
      table: [],
    };
  });

  const cache = new Map<string, CachedChoice>();
  const maxRound = Math.max(...seasons.flatMap((s) => s.fixtures.map((f) => f.round)));
  const disciplineRng = rng.fork('discipline');

  for (let round = 1; round <= maxRound; round++) {
    for (const cs of seasons) {
      for (const fixture of cs.fixtures.filter((f) => f.round === round)) {
        const homeSquad = byClub.get(fixture.homeId) ?? [];
        const awaySquad = byClub.get(fixture.awayId) ?? [];
        const homeSel = selectionFor(fixture.homeId, homeSquad, world, cache);
        const awaySel = selectionFor(fixture.awayId, awaySquad, world, cache);
        const suspended = [...homeSquad, ...awaySquad].filter((p) => p.state.suspensionMatches > 0);

        const report = playMatch(
          sheetFor(fixture.homeId, homeSel, awaySel.strength, balance),
          sheetFor(fixture.awayId, awaySel, homeSel.strength, balance),
          {
            level: cs.competition.level,
            balance,
            formations: world.data.tactics.formations,
            rng: rng.fork(`${cs.competition.id}:${round}:${fixture.homeId}`),
          },
        );

        for (const p of suspended) p.state.suspensionMatches--;
        applyMatchToPlayers(report, byId, balance, disciplineRng);

        const result: MatchResult = { ...fixture, homeGoals: report.homeGoals, awayGoals: report.awayGoals };
        const rated = report.players.filter((l) => l.minutesPlayed > 0);
        cs.results.push(result);
        cs.summaries.push({
          ...result,
          stats: report.stats,
          ratingSum: rated.reduce((s, l) => s + l.rating, 0),
          ratingCount: rated.length,
          injuries: report.players.filter((l) => l.injury).length,
        });
        cs.reports?.push(report);
      }
    }
    passDays(players, balance.condition.daysBetweenRounds, balance);
  }

  for (const cs of seasons) cs.table = computeTable(cs.clubIds, cs.results, cs.competition, `${rng.seed}/${cs.competition.id}/lot`);
  return { seed: String(seed), seasonYear: world.seasonYear, competitions: seasons, players };
}

export type { CompetitionId };
