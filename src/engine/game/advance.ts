// Game loop: the season advances by match days (design, section 3: "Pokračovat" moves time to the
// next match). A match day plays every league round, post-season fixture and cup tie scheduled
// for that date. Between match days time passes: condition recovers (depending on training),
// injuries heal, and on the 1st of every month players develop (design, section 5).
// All randomness is derived from the seed per match / per day, so a loaded game continues identically.

import type { GameData, InjuryType, TrainingIntensity } from '../data.ts';
import { lineupStrength, type TeamSheet } from '../lineup.ts';
import { playMatch } from '../match/engine.ts';
import type { MatchReport } from '../match/types.ts';
import { overall } from '../players/rating.ts';
import type { Seed } from '../rng.ts';
import { doubleRoundRobin } from '../schedule.ts';
import type { CompetitionId, Level, Player, TableRow } from '../types.ts';
import { createWorld, type World } from '../world.ts';
import { addDays, daysBetween, parseDate, roundDates, seasonStart } from './calendar.ts';
import { createCup, cupFinished, cupLevel, nextCupDate, progressCup } from './cup.ts';
import { academyIntake, developmentTick, manageSquads, resolveTraining } from './development.ts';
import { applyMatchToPlayers, returnFromInjury } from './playerState.ts';
import { firstLeagueOrder, postseasonDone, progressPostseason, regularTable, seasonRngOf } from './postseason.ts';
import { membersOf, type Membership } from './pyramid.ts';
import { aiSheet, selectionFor, type SelectionCache } from './selection.ts';
import {
  SAVE_VERSION,
  type CompetitionProgress,
  type DatedFixture,
  type GameState,
  type MatchSummary,
  type NewsItem,
  type StageId,
} from './state.ts';
import { recordStats } from './stats.ts';
import { startBoardSeason } from './board.ts';
import {
  book,
  crossesDate,
  ensureContracts,
  initFinances,
  licenceDate,
  matchBonus,
  matchdayFinance,
  monthlyFinance,
} from './finance.ts';
import { initialUserTeam, prepareUserSheet, userStrength } from './userTeam.ts';
import { aiMarketTick, amortizeRegistrations, emptyMarket, expireOffers, freeAgentTick, marketDays, payDueInstallments } from './market.ts';
import { emptyScouting, refreshCandidates, scoutingTick } from './scouting.ts';
import { attendanceFactor, clubAfterUserMatch, clubMonthTick, initClub, moraleBonus } from './club.ts';

const MAX_NEWS = 80;

// ---------------------------------------------------------------- runtime indexes (not saved)

interface Runtime {
  players: Player[];
  byId: Map<string, Player>;
  /** Senior players by club (academy players excluded). */
  byClub: Map<string, Player[]>;
  academy: Map<string, Player[]>;
  selection: SelectionCache;
}
const runtimes = new WeakMap<GameState, Runtime>();

export function invalidateRuntime(state: GameState): void {
  runtimes.delete(state);
}

export function runtimeOf(state: GameState): Runtime {
  const cached = runtimes.get(state);
  if (cached && cached.players === state.players) return cached;
  const byClub = new Map<string, Player[]>();
  const academy = new Map<string, Player[]>();
  for (const p of state.players) {
    const target = p.academy ? academy : byClub;
    const list = target.get(p.clubId) ?? [];
    list.push(p);
    target.set(p.clubId, list);
  }
  for (const list of [...byClub.values(), ...academy.values()]) list.sort((a, b) => a.id.localeCompare(b.id));
  const rt: Runtime = { players: state.players, byId: new Map(state.players.map((p) => [p.id, p])), byClub, academy, selection: new Map() };
  runtimes.set(state, rt);
  return rt;
}

/** Senior squad of a club. */
export function squadOf(state: GameState, clubId: string): Player[] {
  return runtimeOf(state).byClub.get(clubId) ?? [];
}

export function academyOf(state: GameState, clubId: string): Player[] {
  return runtimeOf(state).academy.get(clubId) ?? [];
}

// ---------------------------------------------------------------- creation

export interface NewGameOptions {
  seed: Seed;
  userClubId: string | null;
  managerName?: string;
}

/** League fixtures and dates for the current membership. */
export function buildCompetitions(state: Pick<GameState, 'seed' | 'seasonYear' | 'membership'>, data: GameData): CompetitionProgress[] {
  const rng = seasonRngOf(state);
  return data.competitions.map((competition) => {
    const clubIds = data.clubs.filter((c) => state.membership[c.id] === competition.id).map((c) => c.id);
    const fixtures = doubleRoundRobin(clubIds, rng.fork(competition.id).fork('draw'));
    const rounds = Math.max(...fixtures.map((f) => f.round));
    return { id: competition.id, clubIds, fixtures, roundDates: roundDates(competition, state.seasonYear, rounds), playedRounds: 0, results: [] };
  });
}

/** Clubs ordered for cup seeding: last season's 1st league order, otherwise squad strength. */
function cupSeeds(state: GameState, data: GameData): string[] {
  const last = state.history.at(-1)?.standings[data.pyramid.firstLeague.id];
  if (last) return last;
  return membersOf(state.membership, data.pyramid.firstLeague.id)
    .map((id) => ({ id, s: selectionFor(id, squadOf(state, id), data, runtimeOf(state).selection).strength }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}

export function startCup(state: GameState, data: GameData): void {
  state.cup = createCup(state, data, cupSeeds(state, data), seasonRngOf(state).fork('cup'));
  payCupRound(state, data, 0);
}

/** Prize money for reaching a cup round (design, section 2: a big chance for a small club). */
function payCupRound(state: GameState, data: GameData, roundIndex: number): void {
  const cup = state.cup;
  const round = cup?.rounds[roundIndex];
  const prize = data.balance.economy.prizeMoney.cupPerRoundReached[roundIndex] ?? 0;
  if (!round || prize <= 0) return;
  for (const t of round.ties)
    for (const id of [t.homeId, t.awayId]) if (id) book(state, id, 'prize', prize, round.date, `${data.pyramid.cup.name}: postup do kola ${round.name}`);
}

/** Game state for an existing world (players are copied, the world is not changed). */
export function createGameState(world: World, opts: NewGameOptions): GameState {
  const data = world.data;
  if (opts.userClubId !== null) {
    const club = data.clubs.find((c) => c.id === opts.userClubId);
    if (!club) throw new Error(`Neznámý klub ${opts.userClubId}`);
    if (club.parentClubId) throw new Error('B a C týmy nejde vést, vyber A-tým.');
  }
  const membership: Membership = Object.fromEntries(data.clubs.map((c) => [c.id, c.competitionId]));
  const start = seasonStart(world.seasonYear);
  const players = (structuredClone(world.players) as (Player & { role?: unknown })[]).map((p) => {
    const { role: _role, ...rest } = p;
    void _role;
    const age = (parseDate(start) - parseDate(p.birthDate)) / (365.25 * 86_400_000);
    return {
      ...rest,
      state: { ...rest.state, seniorMonths: Math.max(0, Math.round((age - 17) * 12)) },
      career: [],
      celHistory: [overall(rest, data.balance)],
    } as Player;
  });
  const state: GameState = {
    version: SAVE_VERSION,
    seed: String(opts.seed),
    seasonYear: world.seasonYear,
    managerName: opts.managerName ?? '',
    userClubId: opts.userClubId,
    date: start,
    membership,
    players,
    competitions: [],
    stages: [],
    cup: null,
    user: null,
    playerStats: {},
    news: [],
    history: [],
    finished: false,
    finances: {},
    transactions: [],
    board: null,
    market: emptyMarket(),
    scouting: emptyScouting(),
    club: null,
  };
  initFinances(state, data, seasonRngOf(state).fork('contracts'));
  freeAgentTick(state, data, start, seasonRngOf(state).fork('free-agents'), data.balance.transfers.freeAgents.poolTarget);
  if (opts.userClubId !== null) refreshCandidates(state, data, seasonRngOf(state).fork('scouts'));
  state.competitions = buildCompetitions(state, data);
  startCup(state, data);
  if (opts.userClubId !== null) {
    state.user = initialUserTeam(squadOf(state, opts.userClubId), data);
    startBoardSeason(state, data);
    state.club = initClub(state, data);
  }
  return state;
}

export function newGame(data: GameData, opts: { seed: Seed; clubId: string; managerName: string; seasonYear?: number }): GameState {
  return createGameState(createWorld(data, opts.seed, opts.seasonYear), { seed: opts.seed, userClubId: opts.clubId, managerName: opts.managerName });
}

// ---------------------------------------------------------------- scheduled matches

/** One match planned for a date, from any competition. */
interface PlannedMatch {
  date: string;
  homeId: string;
  awayId: string;
  level: Level;
  label: string;
  rngKey: string;
  knockout?: { firstLeg?: { home: number; away: number } };
  neutral?: boolean;
  /** Where to store the result. */
  store: (summary: MatchSummary) => void;
  /** Round stored in the result (identifies the fixture). */
  fixtureRound: number;
  /** League competition and round (for UI; null for post-season and cup). */
  competitionId: CompetitionId | null;
  round: number | null;
}

const STAGE_LABEL: Record<StageId, string> = {
  'title-group': 'Skupina o titul',
  'relegation-group': 'Skupina o záchranu',
  'placement-semi': 'Play-off o umístění, semifinále',
  'placement-final': 'Play-off o umístění, finále',
  barrage: 'Baráž',
};

function matchesOn(state: GameState, data: GameData, date: string): PlannedMatch[] {
  const out: PlannedMatch[] = [];
  for (const progress of state.competitions) {
    if (progress.roundDates[progress.playedRounds] !== date) continue;
    const competition = data.competitions.find((c) => c.id === progress.id);
    if (!competition) continue;
    const round = progress.playedRounds + 1;
    for (const f of progress.fixtures.filter((x) => x.round === round))
      out.push({
        date,
        homeId: f.homeId,
        awayId: f.awayId,
        level: competition.level,
        label: `${competition.name}, ${round}. kolo`,
        rngKey: `${progress.id}:${round}:${f.homeId}`,
        store: (s) => progress.results.push(s),
        fixtureRound: round,
        competitionId: progress.id,
        round,
      });
  }
  for (const stage of state.stages) {
    stage.fixtures.forEach((f: DatedFixture) => {
      if (f.date !== date || stage.results.some((r) => r.homeId === f.homeId && r.awayId === f.awayId && r.round === f.round)) return;
      let firstLeg: { home: number; away: number } | undefined;
      if (f.leg === 2) {
        const leg1 = stage.results.find((r) => r.round === 1 && r.homeId === f.awayId && r.awayId === f.homeId);
        if (leg1) firstLeg = { home: leg1.awayGoals, away: leg1.homeGoals };
      }
      const label =
        stage.id === 'barrage' ? `${STAGE_LABEL.barrage}, ${f.leg ?? 1}. zápas` : stage.id.endsWith('group') ? `${STAGE_LABEL[stage.id]}, ${f.round}. kolo` : STAGE_LABEL[stage.id];
      out.push({
        date,
        homeId: f.homeId,
        awayId: f.awayId,
        level: 1,
        label,
        rngKey: `${stage.id}:${f.round}:${f.homeId}`,
        ...(f.knockout ? { knockout: firstLeg ? { firstLeg } : {} } : {}),
        ...(f.neutral ? { neutral: true } : {}),
        store: (s) => stage.results.push(s),
        fixtureRound: f.round,
        competitionId: null,
        round: stage.id.endsWith('group') ? f.round : null,
      });
    });
  }
  const cup = state.cup;
  const round = cup && !cup.winnerId ? cup.rounds[cup.current] : undefined;
  if (cup && round && round.date === date) {
    for (const tie of round.ties) {
      if (tie.awayId === null || tie.result) continue;
      const awayId = tie.awayId;
      out.push({
        date,
        homeId: tie.homeId,
        awayId,
        level: Math.min(cupLevel(state, data, tie.homeId), cupLevel(state, data, awayId), 3) as Level,
        label: `${data.pyramid.cup.name}, ${round.name}`,
        rngKey: `cup:${cup.current}:${tie.homeId}`,
        knockout: {},
        ...(round.neutral ? { neutral: true } : {}),
        store: (s) => (tie.result = s),
        fixtureRound: cup.current + 1,
        competitionId: null,
        round: null,
      });
    }
  }
  return out;
}

export function nextMatchDate(state: GameState): string | null {
  const dates: string[] = [];
  for (const c of state.competitions) {
    const d = c.roundDates[c.playedRounds];
    if (d) dates.push(d);
  }
  for (const s of state.stages)
    for (const f of s.fixtures)
      if (!s.results.some((r) => r.homeId === f.homeId && r.awayId === f.awayId && r.round === f.round)) dates.push(f.date);
  const cupDate = nextCupDate(state);
  if (cupDate) dates.push(cupDate);
  return dates.sort()[0] ?? null;
}

export interface UpcomingMatch {
  date: string;
  label: string;
  homeId: string;
  awayId: string;
  competitionId: CompetitionId | null;
  round: number | null;
}

/** The manager's next match in any competition (null when none is scheduled yet). */
export function nextUserMatch(state: GameState, data?: GameData): UpcomingMatch | null {
  if (!state.userClubId || !data) return nextUserLeagueMatch(state);
  const candidates: UpcomingMatch[] = [];
  const dates = new Set<string>();
  for (const c of state.competitions) for (const d of c.roundDates.slice(c.playedRounds)) dates.add(d);
  for (const s of state.stages) for (const f of s.fixtures) dates.add(f.date);
  const cupDate = nextCupDate(state);
  if (cupDate) dates.add(cupDate);
  for (const d of [...dates].sort()) {
    for (const m of matchesOn(state, data, d))
      if (m.homeId === state.userClubId || m.awayId === state.userClubId)
        candidates.push({ date: m.date, label: m.label, homeId: m.homeId, awayId: m.awayId, competitionId: m.competitionId, round: m.round });
    if (candidates.length > 0) break;
  }
  return candidates[0] ?? null;
}

/** Next league fixture of the manager's club (no data needed). */
function nextUserLeagueMatch(state: GameState): UpcomingMatch | null {
  if (!state.userClubId) return null;
  const comp = state.competitions.find((c) => c.clubIds.includes(state.userClubId as string));
  if (!comp) return null;
  const round = comp.playedRounds + 1;
  const f = comp.fixtures.find((x) => x.round === round && (x.homeId === state.userClubId || x.awayId === state.userClubId));
  const date = comp.roundDates[comp.playedRounds];
  return f && date ? { date, label: `${round}. kolo`, homeId: f.homeId, awayId: f.awayId, competitionId: comp.id, round } : null;
}

export function competitionOfClub(state: GameState, clubId: string): CompetitionProgress | undefined {
  return state.competitions.find((c) => c.clubIds.includes(clubId));
}

/** Regular-season table of a league. */
export function tableFor(state: GameState, competitionId: CompetitionId, data: GameData): TableRow[] {
  return regularTable(state, competitionId, data);
}

/** Final order of every league (the 1st league after its post-season). */
export function finalStandings(state: GameState, data: GameData): Partial<Record<CompetitionId, string[]>> {
  const out: Partial<Record<CompetitionId, string[]>> = {};
  for (const c of state.competitions)
    out[c.id] = c.id === data.pyramid.firstLeague.id ? firstLeagueOrder(state, data) : regularTable(state, c.id, data).map((r) => r.clubId);
  return out;
}

// ---------------------------------------------------------------- time passing

export function leagueCelLookup(state: GameState, data: GameData): (clubId: string) => number {
  const rt = runtimeOf(state);
  const cache = new Map<CompetitionId, number>();
  return (clubId) => {
    const comp = state.membership[clubId];
    if (!comp) return 40;
    let v = cache.get(comp);
    if (v === undefined) {
      const ids = membersOf(state.membership, comp);
      v = ids.reduce((s, id) => s + selectionFor(id, squadOf(state, id), data, rt.selection).strength, 0) / Math.max(1, ids.length);
      cache.set(comp, v);
    }
    return v;
  };
}

function nameOf(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Days pass between two dates (exclusive start, inclusive end) – recovery, healing, training injuries. */
function passSegment(state: GameState, data: GameData, from: string, to: string, news: NewsItem[]): void {
  const days = daysBetween(from, to);
  if (days <= 0) return;
  const { balance } = data;
  const userId = state.userClubId;
  const setting = state.user?.training ?? 'normal';
  const nextUser = userId ? nextUserMatch(state, data)?.date : undefined;
  // Training of the manager's team, day by day.
  let recoveryDays = 0;
  let survive = 1;
  for (let i = 1; i <= days; i++) {
    const day = addDays(from, i);
    const intensity: TrainingIntensity = resolveTraining(setting, nextUser ? daysBetween(day, nextUser) : null, balance);
    recoveryDays += balance.training[intensity].recovery;
    survive *= 1 - balance.training[intensity].injuryPerPlayerDay;
  }
  const rng = seasonRngOf(state).fork(`training:${to}`);
  for (const p of state.players) {
    const s = p.state;
    const own = userId !== null && p.clubId === userId && !p.academy;
    s.condition = Math.min(100, s.condition + balance.condition.recoveryPerDay * (own ? recoveryDays : days));
    if (s.injury) {
      s.injury.daysLeft -= days;
      if (s.injury.daysLeft <= 0) {
        returnFromInjury(p, to, balance);
        if (p.clubId === userId && !p.academy)
          news.push({ date: to, kind: 'recovered', playerId: p.id, text: `${nameOf(p)} je po zranění zpět, pár týdnů bude potřebovat do formy a víc riskuje nové zranění.` });
      }
    } else if (own && survive < 1 && rng.chance(1 - survive)) {
      const light = balance.injuries.types[0] as InjuryType;
      const injury = { type: `${rng.pick(light.names)} (trénink)`, daysLeft: rng.int(light.minDays, light.maxDays) };
      s.injury = injury;
      s.seasonInjuryDays = (s.seasonInjuryDays ?? 0) + injury.daysLeft;
      news.push({ date: to, kind: 'injury', playerId: p.id, text: `${nameOf(p)} se zranil v tréninku, mimo hru zhruba ${injury.daysLeft} dní.` });
    }
  }
}

/** First days of months in (from, to]. */
function monthStarts(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m] = from.split('-').map(Number) as [number, number];
  let year = y;
  let month = m + 1;
  for (;;) {
    if (month > 12) {
      month = 1;
      year++;
    }
    const d = `${year}-${String(month).padStart(2, '0')}-01`;
    if (d > to) break;
    out.push(d);
    month++;
  }
  return out;
}

/** Monthly development tick (and the January academy intake + squad management). */
function monthTick(state: GameState, data: GameData, date: string, news: NewsItem[]): void {
  const rng = seasonRngOf(state).fork(`month:${date}`);
  monthlyFinance(state, data, date);
  amortizeRegistrations(state, data, date);
  payDueInstallments(state, date);
  scoutingTick(state, data, date, rng.fork('scouting'), news);
  clubMonthTick(state, data, date, rng.fork('club'), news);
  freeAgentTick(state, data, date, rng.fork('free-agents'));
  expireOffers(state, date);
  news.push(...developmentTick(state, data, { date, leagueCelOf: leagueCelLookup(state, data), rng: rng.fork('dev') }));
  // Attributes changed: cached line-ups must be chosen again (a loaded game has no cache either).
  invalidateRuntime(state);
  const month = Number(date.slice(5, 7));
  // July intake happens at the season transition.
  if (month !== 7 && data.balance.academy.intakeMonths.includes(month)) {
    news.push(...academyIntake(state, data, date, rng.fork('intake')));
    invalidateRuntime(state);
    news.push(...manageSquads(state, data, { date, leagueCelOf: leagueCelLookup(state, data), rng: rng.fork('squads') }));
    invalidateRuntime(state);
  }
  refreshContracts(state, data, rng.fork('contracts'));
}

/** New players get contracts; academy graduates get a senior wage (negotiations come in phase 6). */
export function refreshContracts(state: GameState, data: GameData, rng: ReturnType<typeof seasonRngOf>): void {
  const academyWages = new Set(Object.values(data.balance.economy.wages.academyMonthly));
  for (const p of state.players) if (!p.academy && p.contract && academyWages.has(p.contract.wage)) delete p.contract;
  ensureContracts(state, data, rng);
}

/** Moves the clock to `to`, with recovery, healing and monthly development on the way. */
export function passTime(state: GameState, data: GameData, to: string, news: NewsItem[]): void {
  const licence = licenceDate(state.seasonYear, data.balance);
  const userFinance = state.userClubId ? state.finances[state.userClubId] : undefined;
  if (userFinance && crossesDate(state.date, to, licence) && userFinance.cash < 0) {
    userFinance.pendingDeduction = data.balance.economy.license.pointDeduction;
    news.push({ date: licence, kind: 'info', text: `Licence: klub má závazky po splatnosti, v příští sezóně přijde o ${userFinance.pendingDeduction} body.` });
  }
  let cursor = state.date;
  // Month starts first; on a day that is both, the market follows the monthly tick.
  const events = [
    ...monthStarts(cursor, to).map((d) => ({ d, market: false })),
    ...marketDays(cursor, to, data).map((d) => ({ d, market: true })),
  ].sort((a, b) => a.d.localeCompare(b.d) || Number(a.market) - Number(b.market));
  for (const e of events) {
    passSegment(state, data, cursor, e.d, news);
    state.date = e.d;
    // The window opening on 1 July is handled by the season transition (new competitions first).
    if (e.market && state.finished && e.d.endsWith('-07-01')) {
      cursor = e.d;
      continue;
    }
    if (e.market) {
      aiMarketTick(state, data, e.d, seasonRngOf(state).fork(`market:${e.d}`), news);
      invalidateRuntime(state);
    } else monthTick(state, data, e.d, news);
    cursor = e.d;
  }
  passSegment(state, data, cursor, to, news);
  state.date = to;
}

// ---------------------------------------------------------------- playing

export interface DayResult {
  date: string;
  played: { label: string; homeId: string; awayId: string }[];
  userReport?: MatchReport;
  news: NewsItem[];
}

export interface AdvanceOptions {
  /** Called with every report (e.g. for calibration or tests); reports are otherwise discarded. */
  onReport?: (report: MatchReport, competitionId: CompetitionId | null, round: number | null, date: string) => void;
}

function pushNews(state: GameState, items: NewsItem[]): void {
  if (items.length === 0) return;
  state.news.push(...items);
  if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
}

function summarize(report: MatchReport, homeId: string, awayId: string, round: number, date: string): MatchSummary {
  const rated = report.players.filter((l) => l.minutesPlayed > 0);
  return {
    round,
    homeId,
    awayId,
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
    ...(report.extraTime ? { extraTime: true } : {}),
    ...(report.penalties ? { penalties: report.penalties } : {}),
  };
}

function userMatchNews(state: GameState, data: GameData, report: MatchReport, before: Map<string, number>, date: string): NewsItem[] {
  const rt = runtimeOf(state);
  const news: NewsItem[] = [];
  for (const line of report.players) {
    if (line.clubId !== state.userClubId) continue;
    const p = rt.byId.get(line.playerId);
    if (!p) continue;
    if (line.injury) news.push({ date, kind: 'injury', playerId: p.id, text: `${nameOf(p)} se zranil (${line.injury.type}), mimo hru zhruba ${line.injury.daysLeft} dní.` });
    const perBan = data.balance.discipline.yellowsPerBan;
    if (line.yellow > 0 && line.red === 'none' && p.state.yellowCards % perBan === perBan - data.balance.discipline.warnAtYellowsBeforeBan)
      news.push({ date, kind: 'suspension', playerId: p.id, text: `Pozor: ${nameOf(p)} má ${p.state.yellowCards} žluté karty, další znamená stopku.` });
    const added = p.state.suspensionMatches - (before.get(p.id) ?? 0);
    if (added > 0) {
      const why = line.red === 'straight' ? 'červená karta' : line.red === 'secondYellow' ? 'druhá žlutá karta' : `${p.state.yellowCards}. žlutá karta`;
      news.push({ date, kind: 'suspension', playerId: p.id, text: `${nameOf(p)} má stopku na ${added} ${added === 1 ? 'zápas' : added < 5 ? 'zápasy' : 'zápasů'} (${why}).` });
    }
  }
  return news;
}

function playPlanned(state: GameState, data: GameData, m: PlannedMatch, news: NewsItem[], opts: AdvanceOptions): MatchReport {
  const rt = runtimeOf(state);
  const { balance } = data;
  const rng = seasonRngOf(state);
  const homeSquad = rt.byClub.get(m.homeId) ?? [];
  const awaySquad = rt.byClub.get(m.awayId) ?? [];
  const homeSel = selectionFor(m.homeId, homeSquad, data, rt.selection);
  const awaySel = selectionFor(m.awayId, awaySquad, data, rt.selection);
  const user = state.user;
  const isUserHome = m.homeId === state.userClubId;
  const isUserAway = m.awayId === state.userClubId;
  const userStr = user && (isUserHome || isUserAway) ? userStrength(user, rt.byId, data) : 0;
  const sheetFor = (clubId: string, squad: Player[], own: typeof homeSel, oppStrength: number, isUser: boolean): TeamSheet => {
    if (isUser && user) {
      const prepared = prepareUserSheet(clubId, user, squad, data, oppStrength, m.date);
      news.push(...prepared.news);
      return prepared.sheet;
    }
    return aiSheet(clubId, own, oppStrength, data);
  };
  const homeSheet = sheetFor(m.homeId, homeSquad, homeSel, isUserAway ? userStr : awaySel.strength, isUserHome);
  const awaySheet = sheetFor(m.awayId, awaySquad, awaySel, isUserHome ? userStr : homeSel.strength, isUserAway);

  const suspended = [...homeSquad, ...awaySquad].filter((p) => p.state.suspensionMatches > 0);
  const bonus = state.club && (isUserHome || isUserAway) ? moraleBonus(state, data) : 0;
  const report = playMatch(homeSheet, awaySheet, {
    level: m.level,
    ...(bonus !== 0 ? { teamBonus: isUserHome ? { home: bonus } : { away: bonus } } : {}),
    balance,
    formations: data.tactics.formations,
    rng: rng.fork(m.rngKey),
    date: m.date,
    ...(m.knockout ? { knockout: m.knockout } : {}),
    ...(m.neutral ? { homeAdvantage: false } : {}),
  });
  for (const p of suspended) p.state.suspensionMatches--;
  const before = new Map([...homeSquad, ...awaySquad].map((p) => [p.id, p.state.suspensionMatches]));
  const leagueProgress = m.competitionId ? state.competitions.find((c) => c.id === m.competitionId) : undefined;
  const tablePosition = leagueProgress ? regularTable(state, leagueProgress.id, data).findIndex((r) => r.clubId === m.homeId) + 1 : null;
  const gate = m.neutral
    ? { attendance: 0, capacity: 0 }
    : matchdayFinance(state, data, m.homeId, m.date, {
        tablePosition,
        teams: leagueProgress?.clubIds.length ?? 16,
        rng: rng.fork(`gate:${m.rngKey}`),
        ...(isUserHome ? { factor: attendanceFactor(state, data) } : {}),
      });
  const outcome = (own: number, opp: number) => (own > opp ? 'W' : own < opp ? 'L' : 'D') as 'W' | 'D' | 'L';
  matchBonus(state, data, m.homeId, outcome(report.homeGoals, report.awayGoals), m.date);
  matchBonus(state, data, m.awayId, outcome(report.awayGoals, report.homeGoals), m.date);
  applyMatchToPlayers(report, rt.byId, balance, rng.fork(`discipline:${m.rngKey}`));
  recordStats(state.playerStats, report);
  m.store({ ...summarize(report, m.homeId, m.awayId, m.fixtureRound, m.date), ...(gate.capacity > 0 ? { attendance: gate.attendance, capacity: gate.capacity } : {}) });
  opts.onReport?.(report, m.competitionId, m.round, m.date);
  if ((isUserHome || isUserAway) && user) {
    user.matches.push({ date: m.date, label: m.label, report });
    news.push(...userMatchNews(state, data, report, before, m.date));
    const scorer = report.events.find((e) => e.type === 'goal' && e.side === (isUserHome ? 'home' : 'away'));
    const scorerName = scorer && 'playerId' in scorer ? rt.byId.get(scorer.playerId as string)?.lastName : undefined;
    clubAfterUserMatch(state, data, { date: m.date, homeId: m.homeId, awayId: m.awayId, homeGoals: report.homeGoals, awayGoals: report.awayGoals, label: m.label, ...(scorerName ? { scorerName } : {}) }, news);
  }
  return report;
}

/** Plays the next match day. Returns null when the season is over. */
export function advanceDay(state: GameState, data: GameData, opts: AdvanceOptions = {}): DayResult | null {
  const date = nextMatchDate(state);
  if (date === null) {
    state.finished = true;
    return null;
  }
  const news: NewsItem[] = [];
  passTime(state, data, date, news);

  const planned = matchesOn(state, data, date);
  if (planned.length === 0 && !state.competitions.some((c) => c.roundDates[c.playedRounds] === date))
    throw new Error(`Hrací den ${date} nemá žádný zápas – chyba v rozpisu`);
  const result: DayResult = { date, played: [], news: [] };
  for (const m of planned) {
    const report = playPlanned(state, data, m, news, opts);
    result.played.push({ label: m.label, homeId: m.homeId, awayId: m.awayId });
    if (report && (m.homeId === state.userClubId || m.awayId === state.userClubId)) result.userReport = report;
  }
  for (const progress of state.competitions) if (progress.roundDates[progress.playedRounds] === date) progress.playedRounds++;

  progressPostseason(state, data);
  const cupRoundBefore = state.cup?.current ?? 0;
  const cupWinnerBefore = state.cup?.winnerId;
  progressCup(state, data, seasonRngOf(state).fork('cup'));
  if (state.cup && state.cup.current > cupRoundBefore && !state.cup.winnerId) payCupRound(state, data, state.cup.current);
  if (state.cup?.winnerId && !cupWinnerBefore)
    book(state, state.cup.winnerId, 'prize', data.balance.economy.prizeMoney.cupWinner, date, `${data.pyramid.cup.name}: vítěz`);

  result.news = news;
  pushNews(state, news);
  state.finished = nextMatchDate(state) === null && seasonComplete(state);
  return result;
}

export function seasonComplete(state: GameState): boolean {
  return state.competitions.every((c) => c.playedRounds >= c.roundDates.length) && postseasonDone(state) && cupFinished(state);
}

/**
 * Plays match days until the manager's team has played (or the season ends). Days on which only
 * other teams play are played on the way. Without a manager it plays one day.
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

/** Plays the rest of the season (league, post-season, barrage, cup). */
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

