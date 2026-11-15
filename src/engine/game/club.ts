// The manager's club beyond the squad (phase 7): stadium levels, rented stadium after a
// promotion, construction with the city, investor and legal form, relations (fans, board, city,
// dressing room), captain, media headlines, press conferences, social feed, random events and
// the winter announcement of a player's last season. Design, sections 9, 13 and 14: this layer
// gives atmosphere and feedback but changes the numbers only a little.

import type { Effects, GameData } from '../data.ts';
import { Rng } from '../rng.ts';
import type { Level, Player, Position } from '../types.ts';
import { finalStandings, squadOf } from './advance.ts';
import { boardGoals, evaluateSeason } from './board.ts';
import { exactAge, retirementChance } from './development.ts';
import { book, levelOf } from './finance.ts';
import type { ClubState, Decision, GameState, Movement, NewsItem, RelationId } from './state.ts';
import { levelOfCompetition } from './pyramid.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step = 1000) => Math.round(v / step) * step;
const nameOf = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Highest stadium level whose capacity the club already has (at least the level its competition requires). */
export function stadiumLevelFor(capacity: number, required: number, data: GameData): number {
  const levels = data.balance.club.stadium.levels;
  let level = 1;
  levels.forEach((l, i) => {
    if (capacity >= l.capacity) level = i + 1;
  });
  return Math.max(level, required);
}

export function requiredStadiumLevel(state: GameState, data: GameData): number {
  const id = state.userClubId;
  return id ? data.balance.club.stadium.requiredByLevel[`${levelOf(state, data, id)}`] : 1;
}

export function initClub(state: GameState, data: GameData): ClubState | null {
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!id || !f) return null;
  const level = levelOf(state, data, id);
  const r = data.balance.club.relations.start;
  return {
    stadiumLevel: stadiumLevelFor(f.capacity, requiredStadiumLevel(state, data), data),
    rented: false,
    project: null,
    cityDeal: null,
    // Professional clubs are companies; small ones start as associations (design, section 13).
    legalForm: level <= 2 ? 'a.s.' : 'spolek',
    investor: null,
    relations: { ...r },
    decisions: [],
    social: [],
    events: 'občas',
    streak: [],
    nextId: 1,
  };
}

// ---------------------------------------------------------------- relations and effects

/** Changes a relation; a captain with high leadership softens drops of the dressing room (CSM addition). */
export function relation(state: GameState, data: GameData, id: RelationId, delta: number): void {
  const club = state.club;
  if (!club || delta === 0) return;
  let d = delta;
  if (id === 'squad' && d < 0 && captainDamps(state, data)) d *= 1 - data.balance.captain.moraleDropDamping;
  club.relations[id] = clamp(club.relations[id] + d, 0, 100);
}

/** The captain of the manager's team (from the line-up) with enough leadership. */
export function captainOf(state: GameState): Player | undefined {
  const id = state.user?.tactics.captainId;
  return id ? state.players.find((p) => p.id === id) : undefined;
}

export function captainDamps(state: GameState, data: GameData): boolean {
  return (captainOf(state)?.leadership ?? 0) >= data.balance.captain.minLeadership;
}

export function applyEffects(state: GameState, data: GameData, effects: Effects, date: string): void {
  const id = state.userClubId;
  if (!id) return;
  for (const k of ['fans', 'board', 'city', 'squad'] as const) if (effects[k]) relation(state, data, k, effects[k] as number);
  if (effects.cash) {
    const scale = data.balance.club.events.moneyScaleByLevel[`${levelOf(state, data, id)}`];
    const amount = round(effects.cash * scale, 1000);
    book(state, id, amount > 0 ? 'otherIncome' : 'otherCost', amount, date, effects.cashNote ?? '');
  }
}

/** Strength bonus of the manager's team from the mood of the dressing room. */
export function moraleBonus(state: GameState, data: GameData): number {
  const club = state.club;
  if (!club) return 0;
  return ((club.relations.squad - 50) / 50) * data.balance.club.morale.maxEffect;
}

/** Attendance factor of the manager's home matches (fans, rented stadium). */
export function attendanceFactor(state: GameState, data: GameData): number {
  const club = state.club;
  if (!club) return 1;
  const c = data.balance.club;
  return (1 + ((club.relations.fans - 50) / 50) * c.fans.attendanceEffect) * (club.rented ? c.stadium.rent.attendanceFactor : 1);
}

function decisionId(club: ClubState): string {
  return `D${club.nextId++}`;
}

function addDecision(state: GameState, d: Omit<Decision, 'id'>): void {
  const club = state.club;
  if (!club) return;
  // One decision of a kind at a time (except events with choices).
  if (d.kind !== 'event' && club.decisions.some((x) => x.kind === d.kind && x.ref === d.ref)) return;
  club.decisions.push({ ...d, id: decisionId(club) });
}

// ---------------------------------------------------------------- after a match of the manager

export interface UserMatchInfo {
  date: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  label: string;
  scorerName?: string;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

export function clubAfterUserMatch(state: GameState, data: GameData, m: UserMatchInfo, news: NewsItem[]): void {
  const club = state.club;
  const id = state.userClubId;
  if (!club || !id) return;
  const r = data.balance.club.relations;
  const home = m.homeId === id;
  const own = home ? m.homeGoals : m.awayGoals;
  const opp = home ? m.awayGoals : m.homeGoals;
  const outcome: 'W' | 'D' | 'L' = own > opp ? 'W' : own < opp ? 'L' : 'D';
  const oppId = home ? m.awayId : m.homeId;
  const me = data.clubs.find((c) => c.id === id);
  const them = data.clubs.find((c) => c.id === oppId);
  const derby = me !== undefined && them !== undefined && me.city === them.city;
  const factor = derby ? r.derbyFactor : 1;
  relation(state, data, 'fans', r.match[outcome].fans * factor);
  relation(state, data, 'squad', r.match[outcome].squad);
  club.streak = [...club.streak, outcome].slice(-6);

  const rng = new Rng(`${state.seed}/media/${m.date}/${id}`);
  const big = Math.abs(own - opp) >= r.bigResultGoals;
  const kind = outcome === 'W' ? (big ? 'bigWin' : 'win') : outcome === 'L' ? (big ? 'bigLoss' : 'loss') : 'draw';
  const level = levelOf(state, data, id);
  const vars = { club: me?.shortName ?? '', opp: them?.shortName ?? '', score: `${m.homeGoals}:${m.awayGoals}`, city: me?.city ?? '', player: m.scorerName ?? 'kapitán' };
  const outlet = fill(rng.pick(data.flavor.outlets[`${level}`]), vars);
  news.push({ date: m.date, kind: 'media', text: `${outlet}: ${fill(rng.pick(data.flavor.headlines[kind]), vars)}` });

  // Social feed: no effect on the numbers.
  const pool = outcome === 'W' ? data.flavor.social.win : outcome === 'L' ? data.flavor.social.loss : data.flavor.social.draw;
  const squad = squadOf(state, id);
  const playerName = squad.length > 0 ? rng.pick(squad).lastName : 'kapitán';
  for (let i = 0; i < data.balance.club.socialPerMatch; i++) {
    const text = fill(rng.pick(i === 0 ? pool : [...pool, ...data.flavor.social.neutral]), { ...vars, player: playerName });
    club.social.push({ date: m.date, author: fill(rng.pick(data.flavor.social.authors), { city: (me?.city ?? 'klub').toLowerCase().replace(/\s+/g, '_') }), text });
  }
  if (club.social.length > 40) club.social.splice(0, club.social.length - 40);

  // Press conferences only at important moments.
  const p = data.balance.club.press;
  const last = club.streak.slice(-Math.max(p.lossStreak, p.winStreak));
  if (last.length >= p.lossStreak && last.slice(-p.lossStreak).every((x) => x === 'L')) pressConference(state, data, 'lossStreak', m.date);
  if (last.length >= p.winStreak && last.slice(-p.winStreak).every((x) => x === 'W')) pressConference(state, data, 'winStreak', m.date);
}

export function pressConference(state: GameState, data: GameData, trigger: string, date: string): void {
  const text = data.flavor.press.triggers[trigger];
  if (!text || !state.club) return;
  state.club.decisions = state.club.decisions.filter((d) => d.kind !== 'press');
  addDecision(state, { kind: 'press', date, title: 'Tisková konference', text, options: data.flavor.press.options.map((o) => ({ label: o.label, effects: o.effects })), ref: trigger });
}

// ---------------------------------------------------------------- monthly

export function clubMonthTick(state: GameState, data: GameData, date: string, rng: Rng, news: NewsItem[]): void {
  const club = state.club;
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!club || !id || !f) return;
  const c = data.balance.club;
  const r = c.relations;
  // Relations slowly return to their usual level.
  for (const k of ['fans', 'city', 'squad'] as const) club.relations[k] += (r.start[k] - club.relations[k]) * r.driftPerMonth;
  const level = levelOf(state, data, id);
  const reference = data.balance.economy.ticketPrice.reference[`${level}`];
  if (f.ticketPrice > reference * r.ticketTooExpensive) relation(state, data, 'fans', -1);
  if (f.ticketPrice < reference * r.ticketCheap) relation(state, data, 'fans', 1);
  if (state.players.filter((p) => p.clubId === id && p.academy).length >= c.city.academyTarget) relation(state, data, 'city', r.academyCityBonus);
  updateBoardRelation(state, data);

  // Unhappy players: in form, but not playing.
  const stats = state.playerStats;
  const played = state.user?.matches.length ?? 0;
  if (played >= 4)
    for (const p of squadOf(state, id)) {
      const recent = p.state.recentRatings.slice(-3);
      const form = recent.length > 0 ? recent.reduce((s, x) => s + x, 0) / recent.length : 0;
      const share = (stats[p.id]?.minutes ?? 0) / (played * 90);
      if (form >= r.unhappyPlayer.minForm && share < r.unhappyPlayer.maxMinutesShare && !p.state.injury) {
        relation(state, data, 'squad', r.unhappyPlayer.squad);
        news.push({ date, kind: 'info', playerId: p.id, text: `${nameOf(p)} je ve formě a chce víc hrát. V kabině to začíná být znát.` });
        break;
      }
    }

  // Rent of a borrowed stadium.
  if (club.rented) book(state, id, 'stadium', -round(f.expectedRevenue * c.stadium.rent.monthlyShareOfRevenue), date, 'nájem stadionu');

  // Stadium construction: monthly payments; the city's share lowers the cost of the asset.
  const pr = club.project;
  if (pr) {
    const months = data.balance.club.stadium.levels[pr.targetLevel - 2]?.months ?? 1;
    const own = round((pr.cost * (1 - pr.cityShare)) / months);
    book(state, id, 'investment', -own, date, `stavba stadionu (${data.balance.club.stadium.levels[pr.targetLevel - 1]?.label})`);
    f.stadiumValue += own;
    if (club.cityDeal?.status === 'active') club.cityDeal.paid += round((pr.cost * pr.cityShare) / months);
    pr.monthsLeft--;
    if (pr.monthsLeft <= 0) {
      club.stadiumLevel = pr.targetLevel;
      const target = data.balance.club.stadium.levels[pr.targetLevel - 1];
      if (target) f.capacity = Math.max(f.capacity, target.capacity);
      club.project = null;
      if (club.stadiumLevel >= requiredStadiumLevel(state, data)) club.rented = false;
      relation(state, data, 'fans', 5);
      relation(state, data, 'city', 3);
      news.push({ date, kind: 'info', text: `Stavba je hotová: stadion má úroveň ${club.stadiumLevel} (${target?.label}), kapacita ${f.capacity.toLocaleString('cs-CZ')}.` });
    }
  }

  // Winter: players may announce their last season.
  if (Number(date.slice(5, 7)) === data.balance.retirement.lastSeasonAnnouncement.month) announceLastSeasons(state, data, date, news);

  randomEvent(state, data, date, rng.fork('event'), news);
}

/** The board indicator shows the running evaluation of the season (design, section 14). */
export function updateBoardRelation(state: GameState, data: GameData): void {
  const club = state.club;
  const id = state.userClubId;
  if (!club || !id || !state.board) return;
  const played = state.user?.matches.length ?? 0;
  if (played < 3) return;
  const e = evaluateSeason(state, data, false);
  if (!e) return;
  const score = data.balance.board.gradeScore[e.overall] ?? 0;
  const cash = state.finances[id]?.cash ?? 0;
  club.relations.board = clamp(55 + 15 * score - (cash < 0 ? 15 : 0), 0, 100);
}

function randomEvent(state: GameState, data: GameData, date: string, rng: Rng, news: NewsItem[]): void {
  const club = state.club;
  const id = state.userClubId;
  if (!club || !id) return;
  const e = data.balance.club.events;
  const level = levelOf(state, data, id);
  const chance = e.chance[club.events] * (level === 3 ? e.lowerLeagueFactor : 1);
  if (!rng.chance(Math.min(1, chance))) return;
  const pool = data.flavor.events.filter((x) => x.levels.includes(level));
  if (pool.length === 0) return;
  const ev = rng.pick(pool);
  if (ev.options) {
    addDecision(state, { kind: 'event', date, title: ev.title, text: ev.text, options: ev.options.map((o) => ({ label: o.label, effects: o.effects })), ref: ev.id });
    news.push({ date, kind: 'info', text: `${ev.title}: čeká na tvé rozhodnutí (Klub).` });
  } else {
    applyEffects(state, data, ev.effects ?? {}, date);
    news.push({ date, kind: 'info', text: `${ev.title}. ${ev.text}` });
  }
}

/** January: players likely to retire announce it (design, section 5; phase 7). */
function announceLastSeasons(state: GameState, data: GameData, date: string, news: NewsItem[]): void {
  const id = state.userClubId;
  if (!id) return;
  const a = data.balance.retirement.lastSeasonAnnouncement;
  const comp = state.membership[id];
  for (const p of squadOf(state, id)) {
    if (p.lastSeason) continue;
    const s = state.playerStats[p.id];
    const played = state.user?.matches.length ?? 0;
    const chance = retirementChance(
      {
        age: exactAge(p.birthDate, `${state.seasonYear + 1}-07-01`),
        position: p.positions[0] as Position,
        avgRating: s && s.apps > 0 ? s.ratingSum / s.apps : null,
        minutesShare: played > 0 ? Math.min(1, (s?.minutes ?? 0) / (played * 90)) : 0,
        level: comp ? (levelOfCompetition(data, comp) as Level) : null,
        professionalism: p.hidden.professionalism,
        injuryDays: p.state.seasonInjuryDays ?? 0,
        contractNextSeason: p.contract !== undefined && p.contract.until >= `${state.seasonYear + 2}-06-30`,
      },
      data.balance,
    );
    if (chance < a.minChance) continue;
    p.lastSeason = { announced: date };
    news.push({ date, kind: 'season', playerId: p.id, text: `${nameOf(p)} oznámil, že je to jeho poslední sezóna. Fanoušci chystají rozloučení.` });
    addDecision(state, {
      kind: 'lastSeason',
      date,
      title: `${nameOf(p)} končí`,
      text: `${nameOf(p)} (${Math.floor(exactAge(p.birthDate, date))}) chce po sezóně skončit. Můžeš ho zkusit přemluvit – šance je malá.`,
      options: [
        { label: 'Zkusit přemluvit', effects: {}, action: 'persuade' },
        { label: 'Popřát mu hezké rozloučení', effects: { fans: 1, squad: 1 } },
      ],
      ref: p.id,
    });
  }
}

// ---------------------------------------------------------------- decisions

export function resolveDecision(state: GameState, data: GameData, decisionId: string, option: number): string {
  const club = state.club;
  const d = club?.decisions.find((x) => x.id === decisionId);
  const o = d?.options[option];
  if (!club || !d || !o) return 'Rozhodnutí už neplatí.';
  club.decisions = club.decisions.filter((x) => x.id !== decisionId);
  applyEffects(state, data, o.effects, state.date);
  if (o.action === 'persuade' && d.ref) {
    const p = state.players.find((x) => x.id === d.ref);
    if (!p) return 'Hráč už v klubu není.';
    if (new Rng(`${state.seed}/persuade/${p.id}/${state.seasonYear}`).chance(data.balance.retirement.lastSeasonAnnouncement.persuadeSuccess)) {
      p.lastSeason = { announced: p.lastSeason?.announced ?? state.date, persuaded: true };
      relation(state, data, 'fans', 2);
      return `${nameOf(p)} si to rozmyslel a ještě rok přidá!`;
    }
    return `${nameOf(p)} je rozhodnutý. Po sezóně končí.`;
  }
  if (o.action === 'investor' && d.ref) return acceptInvestor(state, data, d.ref);
  if (o.action === 'cityDeal') return startStadiumProject(state, data, true);
  return `Rozhodnuto: ${o.label}`;
}

// ---------------------------------------------------------------- stadium and city

export function projectCost(state: GameState, data: GameData): number {
  const club = state.club;
  return club ? (data.balance.club.stadium.levels[club.stadiumLevel - 1]?.costToNext ?? 0) : 0;
}

export function cityShare(state: GameState, data: GameData): number {
  const c = data.balance.club.city;
  return clamp(((state.club?.relations.city ?? 0) - c.shareFrom) * c.sharePerPoint, 0, c.maxShare);
}

/** Starts the construction of the next stadium level (with the city, if a deal was agreed). */
export function startStadiumProject(state: GameState, data: GameData, withCity: boolean): string {
  const club = state.club;
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!club || !id || !f) return 'Klub neexistuje.';
  if (club.project) return 'Stavba už běží.';
  const levels = data.balance.club.stadium.levels;
  const next = levels[club.stadiumLevel];
  // Price and duration of building the next level are kept on the current level.
  const months = levels[club.stadiumLevel - 1]?.months ?? 1;
  const cost = projectCost(state, data);
  if (!next || cost <= 0) return 'Stadion má nejvyšší úroveň.';
  const share = withCity ? cityShare(state, data) : 0;
  const monthly = round((cost * (1 - share)) / months);
  if (f.cash < monthly) return `Na první splátku stavby (${Math.round(monthly / 1000).toLocaleString('cs-CZ')} tis. Kč) nemáš peníze.`;
  club.project = { targetLevel: club.stadiumLevel + 1, monthsLeft: months, cost, cityShare: share, startedAt: state.date };
  return `Stavba začala: ${next.label}, hotovo za ${months} měsíců${share > 0 ? `, město platí ${Math.round(share * 100)} %` : ''}.`;
}

/** The city proposes a deal with a condition (design, section 9: a mission). */
export function requestCityDeal(state: GameState, data: GameData): string {
  const club = state.club;
  const id = state.userClubId;
  if (!club || !id) return '';
  if (club.project) return 'Stavba už běží.';
  if (club.cityDeal?.status === 'active') return 'Dohoda s městem už platí.';
  const share = cityShare(state, data);
  if (share <= 0) return 'Město teď nemá zájem přispět. Vztah s městem zlepší výsledky a práce s mládeží.';
  const rng = new Rng(`${state.seed}/city/${state.seasonYear}/${club.nextId}`);
  const level = levelOf(state, data, id);
  const options: ('topHalf' | 'promotion' | 'academy')[] = level > 1 ? ['topHalf', 'academy', 'promotion'] : ['topHalf', 'academy'];
  const condition = rng.pick(options);
  const target = data.balance.club.city.academyTarget;
  const label =
    condition === 'topHalf' ? 'skončit letos v horní polovině tabulky' : condition === 'promotion' ? 'letos postoupit' : `mít na konci sezóny v akademii aspoň ${target} hráčů`;
  club.cityDeal = { condition, label, seasonYear: state.seasonYear, share, paid: 0, status: 'active' };
  addDecision(state, {
    kind: 'cityDeal',
    date: state.date,
    title: 'Nabídka města',
    text: `Město zaplatí ${Math.round(share * 100)} % stavby (${data.balance.club.stadium.levels[club.stadiumLevel]?.label}), když klub splní podmínku: ${label}. Když ne, vztah s městem utrpí a polovinu peněz bude chtít zpět.`,
    options: [
      { label: 'Přijmout a začít stavět', effects: {}, action: 'cityDeal' },
      { label: 'Odmítnout', effects: { city: -2 } },
    ],
  });
  return 'Město poslalo nabídku (Klub → K rozhodnutí).';
}

// ---------------------------------------------------------------- investor

function acceptInvestor(state: GameState, data: GameData, name: string): string {
  const club = state.club;
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!club || !id || !f) return '';
  const c = data.balance.club.investor;
  const deposit = round(f.expectedRevenue * c.depositShareOfRevenue, 100_000);
  book(state, id, 'ownerDeposit', deposit, state.date, `vklad investora: ${name}`);
  club.legalForm = 'a.s.';
  club.investor = { name, deposit, untilSeason: state.seasonYear + c.seasons - 1 };
  relation(state, data, 'board', -5);
  const goals = boardGoals(state, data);
  if (state.board && goals) state.board.goals = goals;
  return `Klub je akciová společnost. ${name} vložil ${Math.round(deposit / 1_000_000).toLocaleString('cs-CZ')} mil. Kč a čeká rychlé výsledky.`;
}

// ---------------------------------------------------------------- season transition

/** End of the season (before the new membership): city deal, investor, farewell. */
export function clubSeasonEnd(state: GameState, data: GameData, movement: Movement | undefined, news: NewsItem[]): void {
  const club = state.club;
  const id = state.userClubId;
  if (!club || !id) return;
  const deal = club.cityDeal;
  if (deal && deal.status === 'active' && deal.seasonYear === state.seasonYear) {
    const comp = state.membership[id];
    const order = comp ? (finalStandings(state, data)[comp] ?? []) : [];
    const pos = order.indexOf(id) + 1;
    const promoted = movement?.to && movement.from ? levelOfCompetition(data, movement.to) < levelOfCompetition(data, movement.from) : false;
    const met =
      deal.condition === 'topHalf'
        ? pos > 0 && pos <= order.length / 2
        : deal.condition === 'promotion'
          ? promoted
          : state.players.filter((p) => p.clubId === id && p.academy).length >= data.balance.club.city.academyTarget;
    const c = data.balance.club.city;
    deal.status = met ? 'met' : 'failed';
    if (met) {
      relation(state, data, 'city', c.metBonus);
      news.push({ date: state.date, kind: 'info', text: `Dohoda s městem splněna (${deal.label}). Radnice je spokojená.` });
    } else {
      relation(state, data, 'city', -c.failedPenalty);
      const repay = round(deal.paid * c.failedRepayShare);
      if (repay > 0) book(state, id, 'otherCost', -repay, state.date, 'vrácení části dotace městu');
      news.push({ date: state.date, kind: 'info', text: `Dohodu s městem se nepodařilo splnit (${deal.label}). Město chce zpět ${Math.round(repay / 1000).toLocaleString('cs-CZ')} tis. Kč.` });
    }
  }
  if (club.investor && club.investor.untilSeason <= state.seasonYear) club.investor = null;
}

/** Start of the new season: stadium licence, rented stadium, investor offer, press conference. */
export function clubSeasonStart(state: GameState, data: GameData, movement: Movement | undefined, news: NewsItem[]): void {
  const club = state.club;
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!club || !id || !f) return;
  const c = data.balance.club;
  club.streak = [];
  const required = requiredStadiumLevel(state, data);
  if (club.stadiumLevel >= required) club.rented = false;
  else if (club.rented && !club.project) {
    f.pointDeduction += c.stadium.licencePointsIfNotStarted;
    news.push({ date: state.date, kind: 'info', text: `Licence: stadion pořád nesplňuje podmínky soutěže a stavba nezačala. Klub přichází o ${c.stadium.licencePointsIfNotStarted} body.` });
  } else if (!club.rented) {
    club.rented = true;
    relation(state, data, 'fans', -c.stadium.rent.fansPenalty);
    news.push({ date: state.date, kind: 'info', text: `Náš stadion nesplňuje podmínky nové soutěže (potřeba úroveň ${required}). Sezónu hrajeme v pronajatém stadionu; do příští sezóny musí být rozestavěno.` });
  }
  const up = movement?.to && movement.from ? levelOfCompetition(data, movement.to) < levelOfCompetition(data, movement.from) : false;
  const down = movement?.to && movement.from ? levelOfCompetition(data, movement.to) > levelOfCompetition(data, movement.from) : false;
  if (up) pressConference(state, data, 'promotion', state.date);
  if (down) pressConference(state, data, 'relegation', state.date);
  // Investor interest after a promotion of an association (design, section 13).
  if (up && club.legalForm === 'spolek') {
    const name = new Rng(`${state.seed}/investor/${state.seasonYear}`).pick(data.flavor.investors);
    const deposit = round(f.expectedRevenue * c.investor.depositShareOfRevenue, 100_000);
    addDecision(state, {
      kind: 'investor',
      date: state.date,
      title: 'Investor má zájem',
      text: `${name} chce do klubu vložit ${Math.round(deposit / 1_000_000).toLocaleString('cs-CZ')} mil. Kč. Klub se změní na akciovou společnost a investor bude ${c.investor.seasons} sezóny chtít výsledky o místo lepší, než plánuje vedení.`,
      options: [
        { label: 'Přijmout investora', effects: {}, action: 'investor' },
        { label: 'Zůstat spolkem', effects: { fans: c.investor.declineFans } },
      ],
      ref: name,
    });
  }
  // A new season: the board starts from its usual mood until the first results.
  club.relations.board = c.relations.start.board;
}

/** Players who announced their last season retire; persuaded ones stay one more season. */
export function lastSeasonOutcome(p: Player): 'retire' | 'stay' | null {
  if (!p.lastSeason) return null;
  return p.lastSeason.persuaded ? 'stay' : 'retire';
}

/** Popular players: a sale hurts the fans a little. */
export function isFavourite(state: GameState, p: Player): boolean {
  const id = state.userClubId;
  if (!id) return false;
  const squad = squadOf(state, id);
  const apps = (x: Player) => state.playerStats[x.id]?.apps ?? 0;
  const top = [...squad].sort((a, b) => apps(b) - apps(a) || a.id.localeCompare(b.id)).slice(0, 3);
  return top.some((x) => x.id === p.id);
}

