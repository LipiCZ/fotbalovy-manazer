// Game loop: the season advances by match days. Every call plays all league rounds scheduled for
// the next match date (design, section 3: "Pokračovat" moves time to the next match).
// All randomness is derived from the seed per match, so a loaded game continues identically.

import type { GameData } from '../data.ts';
import { lineupStrength } from '../lineup.ts';
import { playMatch } from '../match/engine.ts';
import type { MatchReport } from '../match/types.ts';
import { Rng, type Seed } from '../rng.ts';
import { doubleRoundRobin } from '../schedule.ts';
import { computeTable } from '../table.ts';
import type { CompetitionId, Fixture, Player, TableRow } from '../types.ts';
import { createWorld, type World } from '../world.ts';
import { daysBetween, roundDates, seasonStart } from './calendar.ts';
import { applyMatchToPlayers, passDays } from './playerState.ts';
import { aiSheet, selectionFor, type SelectionCache } from './selection.ts';
import { SAVE_VERSION, type CompetitionProgress, type GameState, type MatchSummary, type NewsItem } from './state.ts';
import { recordStats } from './stats.ts';
import { initialUserTeam, prepareUserSheet, userStrength } from './userTeam.ts';

const MAX_NEWS = 60;

// ---------------------------------------------------------------- runtime indexes (not saved)

interface Runtime {
  players: Player[];
  byId: Map<string, Player>;
  byClub: Map<string, Player[]>;
  selection: SelectionCache;
}
const runtimes = new WeakMap<GameState, Runtime>();

export function runtimeOf(state: GameState): Runtime {
  const cached = runtimes.get(state);
  if (cached && cached.players === state.players) return cached;
  const byClub = new Map<string, Player[]>();
  for (const p of state.players) {
    const list = byClub.get(p.clubId) ?? [];
    list.push(p);
    byClub.set(p.clubId, list);
  }
  for (const list of byClub.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  const rt: Runtime = { players: state.players, byId: new Map(state.players.map((p) => [p.id, p])), byClub, selection: new Map() };
  runtimes.set(state, rt);
  return rt;
}

export function squadOf(state: GameState, clubId: string): Player[] {
  return runtimeOf(state).byClub.get(clubId) ?? [];
}

const seasonRng = (state: Pick<GameState, 'seed' | 'seasonYear'>) => new Rng(`${state.seed}/season-${state.seasonYear}`);

// ---------------------------------------------------------------- creation

export interface NewGameOptions {
  seed: Seed;
  userClubId: string | null;
  managerName?: string;
}

/** Game state for an existing world (players are copied, the world is not changed). */
export function createGameState(world: World, opts: NewGameOptions): GameState {
  const data = world.data;
  if (opts.userClubId !== null) {
    const club = data.clubs.find((c) => c.id === opts.userClubId);
    if (!club) throw new Error(`Neznámý klub ${opts.userClubId}`);
    if (club.parentClubId) throw new Error('B a C týmy nejde vést, vyber A-tým.');
  }
  const base = { seed: String(opts.seed), seasonYear: world.seasonYear };
  const rng = seasonRng(base);
  const players = structuredClone(world.players) as Player[];

  const competitions: CompetitionProgress[] = data.competitions.map((competition) => {
    const clubIds = data.clubs.filter((c) => c.competitionId === competition.id).map((c) => c.id);
    const fixtures = doubleRoundRobin(clubIds, rng.fork(competition.id).fork('draw'));
    const rounds = Math.max(...fixtures.map((f) => f.round));
    return { id: competition.id, clubIds, fixtures, roundDates: roundDates(competition, world.seasonYear, rounds), playedRounds: 0, results: [] };
  });

  const state: GameState = {
    version: SAVE_VERSION,
    ...base,
    managerName: opts.managerName ?? '',
    userClubId: opts.userClubId,
    date: seasonStart(world.seasonYear),
    players,
    competitions,
    user: null,
    playerStats: {},
    news: [],
    finished: false,
  };
  if (opts.userClubId !== null) state.user = initialUserTeam(squadOf(state, opts.userClubId), data);
  return state;
}

export function newGame(data: GameData, opts: { seed: Seed; clubId: string; managerName: string; seasonYear?: number }): GameState {
  return createGameState(createWorld(data, opts.seed, opts.seasonYear), { seed: opts.seed, userClubId: opts.clubId, managerName: opts.managerName });
}

// ---------------------------------------------------------------- queries

export function nextMatchDate(state: GameState): string | null {
  let next: string | null = null;
  for (const c of state.competitions) {
    const d = c.roundDates[c.playedRounds];
    if (d !== undefined && (next === null || d < next)) next = d;
  }
  return next;
}

export interface UpcomingMatch {
  competitionId: CompetitionId;
  round: number;
  date: string;
  fixture: Fixture;
}

export function nextUserMatch(state: GameState): UpcomingMatch | null {
  if (!state.userClubId) return null;
  const comp = state.competitions.find((c) => c.clubIds.includes(state.userClubId as string));
  if (!comp) return null;
  const round = comp.playedRounds + 1;
  const fixture = comp.fixtures.find((f) => f.round === round && (f.homeId === state.userClubId || f.awayId === state.userClubId));
  const date = comp.roundDates[comp.playedRounds];
  return fixture && date ? { competitionId: comp.id, round, date, fixture } : null;
}

export function competitionOfClub(state: GameState, clubId: string): CompetitionProgress | undefined {
  return state.competitions.find((c) => c.clubIds.includes(clubId));
}

export function tableFor(state: GameState, competitionId: CompetitionId, data: GameData): TableRow[] {
  const progress = state.competitions.find((c) => c.id === competitionId);
  const competition = data.competitions.find((c) => c.id === competitionId);
  if (!progress || !competition) return [];
  return computeTable(progress.clubIds, progress.results, competition, `${seasonRng(state).seed}/${competitionId}/lot`);
}

// ---------------------------------------------------------------- playing

export interface DayResult {
  date: string;
  played: { competitionId: CompetitionId; round: number }[];
  userReport?: MatchReport;
  news: NewsItem[];
}

export interface AdvanceOptions {
  /** Called with every report (e.g. for calibration or tests); reports are otherwise discarded. */
  onReport?: (report: MatchReport, competitionId: CompetitionId, round: number) => void;
}

function pushNews(state: GameState, items: NewsItem[]): void {
  if (items.length === 0) return;
  state.news.push(...items);
  if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
}

function userMatchNews(state: GameState, report: MatchReport, before: Map<string, number>, date: string): NewsItem[] {
  const rt = runtimeOf(state);
  const news: NewsItem[] = [];
  for (const line of report.players) {
    if (line.clubId !== state.userClubId) continue;
    const p = rt.byId.get(line.playerId);
    if (!p) continue;
    const name = `${p.firstName} ${p.lastName}`;
    if (line.injury)
      news.push({ date, kind: 'injury', playerId: p.id, text: `${name} se zranil (${line.injury.type}), mimo hru zhruba ${line.injury.daysLeft} dní.` });
    const added = p.state.suspensionMatches - (before.get(p.id) ?? 0);
    if (added > 0) {
      const why = line.red === 'straight' ? 'červená karta' : line.red === 'secondYellow' ? 'druhá žlutá karta' : `${p.state.yellowCards}. žlutá karta`;
      news.push({ date, kind: 'suspension', playerId: p.id, text: `${name} má stopku na ${added} ${added === 1 ? 'zápas' : added < 5 ? 'zápasy' : 'zápasů'} (${why}).` });
    }
  }
  return news;
}

function summarize(report: MatchReport, fixture: Fixture, date: string): MatchSummary {
  const rated = report.players.filter((l) => l.minutesPlayed > 0);
  return {
    ...fixture,
    date,
    homeGoals: report.homeGoals,
    awayGoals: report.awayGoals,
    stats: report.stats,
    ratingSum: rated.reduce((s, l) => s + l.rating, 0),
    ratingCount: rated.length,
    injuries: report.players.filter((l) => l.injury).length,
    scorers: report.events
      .filter((e) => (e.type === 'goal' || e.type === 'penaltyGoal') && e.playerId)
      .map((e) => [e.playerId as string, e.minute + (e.added ?? 0) / 100, e.side]),
  };
}

/** Plays the next match day. Returns null when the season is over. */
export function advanceDay(state: GameState, data: GameData, opts: AdvanceOptions = {}): DayResult | null {
  const date = nextMatchDate(state);
  if (date === null) {
    state.finished = true;
    return null;
  }
  const rt = runtimeOf(state);
  const { balance } = data;
  const rng = seasonRng(state);
  const dayNews: NewsItem[] = [];

  // Time passes until the match day.
  const healed = passDays(rt.players, daysBetween(state.date, date), balance);
  for (const p of healed)
    if (p.clubId === state.userClubId) dayNews.push({ date, kind: 'recovered', playerId: p.id, text: `${p.firstName} ${p.lastName} je po zranění zpět.` });
  state.date = date;

  const result: DayResult = { date, played: [], news: [] };
  for (const progress of state.competitions) {
    if (progress.roundDates[progress.playedRounds] !== date) continue;
    const competition = data.competitions.find((c) => c.id === progress.id);
    if (!competition) throw new Error(`Neznámá soutěž ${progress.id}`);
    const round = progress.playedRounds + 1;

    for (const fixture of progress.fixtures.filter((f) => f.round === round)) {
      const homeSquad = rt.byClub.get(fixture.homeId) ?? [];
      const awaySquad = rt.byClub.get(fixture.awayId) ?? [];
      const homeSel = selectionFor(fixture.homeId, homeSquad, data, rt.selection);
      const awaySel = selectionFor(fixture.awayId, awaySquad, data, rt.selection);
      const isUserHome = fixture.homeId === state.userClubId;
      const isUserAway = fixture.awayId === state.userClubId;
      const user = state.user;
      const userStr = user && (isUserHome || isUserAway) ? userStrength(user, rt.byId, data) : 0;

      const sheetFor = (clubId: string, squad: Player[], own: typeof homeSel, oppStrength: number, isUser: boolean) => {
        if (isUser && user) {
          const prepared = prepareUserSheet(clubId, user, squad, data, oppStrength, date);
          dayNews.push(...prepared.news);
          return prepared.sheet;
        }
        return aiSheet(clubId, own, oppStrength, data);
      };
      const homeSheet = sheetFor(fixture.homeId, homeSquad, homeSel, isUserAway ? userStr : awaySel.strength, isUserHome);
      const awaySheet = sheetFor(fixture.awayId, awaySquad, awaySel, isUserHome ? userStr : homeSel.strength, isUserAway);

      const suspended = [...homeSquad, ...awaySquad].filter((p) => p.state.suspensionMatches > 0);
      const suspensionsBefore = new Map([...homeSquad, ...awaySquad].map((p) => [p.id, p.state.suspensionMatches]));
      const report = playMatch(homeSheet, awaySheet, {
        level: competition.level,
        balance,
        formations: data.tactics.formations,
        rng: rng.fork(`${progress.id}:${round}:${fixture.homeId}`),
      });
      for (const p of suspended) {
        p.state.suspensionMatches--;
        suspensionsBefore.set(p.id, p.state.suspensionMatches);
      }
      applyMatchToPlayers(report, rt.byId, balance, rng.fork(`discipline:${progress.id}:${round}:${fixture.homeId}`));
      recordStats(state.playerStats, report);
      progress.results.push(summarize(report, fixture, date));
      opts.onReport?.(report, progress.id, round);

      if (isUserHome || isUserAway) {
        state.user?.reports.push(report);
        result.userReport = report;
        dayNews.push(...userMatchNews(state, report, suspensionsBefore, date));
      }
    }
    progress.playedRounds = round;
    result.played.push({ competitionId: progress.id, round });
  }

  result.news = dayNews;
  pushNews(state, dayNews);
  if (nextMatchDate(state) === null) state.finished = true;
  return result;
}

/**
 * Plays match days until the manager's team has played (or the season ends). Days on which only
 * other competitions play are played on the way. Without a manager it plays one day.
 */
export function advanceToNextUserMatch(state: GameState, data: GameData, opts: AdvanceOptions = {}): DayResult[] {
  const days: DayResult[] = [];
  for (;;) {
    const day = advanceDay(state, data, opts);
    if (!day) break;
    days.push(day);
    if (day.userReport || !state.userClubId) break;
  }
  return days;
}

/** Plays the rest of the season. */
export function playToSeasonEnd(state: GameState, data: GameData, opts: AdvanceOptions = {}): void {
  while (advanceDay(state, data, opts)) {
    /* keep playing */
  }
}

export function userLineupStrength(state: GameState, data: GameData): number {
  if (!state.user) return 0;
  return lineupStrength(
    {
      formation: state.user.tactics.formation,
      slots: state.user.lineup.slots,
      lineup: state.user.lineup.playerIds.map((id) => (id ? (runtimeOf(state).byId.get(id) ?? null) : null)),
      total: 0,
    },
    data.balance,
  );
}
