// Coach career (design, section 10; phase 8): career from the bottom (a background and 3–4
// offers from 3rd-level clubs with different profiles) or a free choice; the coach's reputation
// grows with successful seasons; bigger clubs sometimes offer a job; a catastrophic season or two
// failed seasons in a row mean the sack and a new job from the offers.

import type { ClubProfile, CoachBackground, GameData } from '../data.ts';
import { Rng } from '../rng.ts';
import type { Club, Level } from '../types.ts';
import { invalidateRuntime, squadOf } from './advance.ts';
import { startBoardSeason, wouldBeSacked } from './board.ts';
import { applyEffects, initClub } from './club.ts';
import { levelOf } from './finance.ts';
import { initialUserTeam } from './userTeam.ts';
import type { CoachState, GameState, JobOffer, Movement, NewsItem, SeasonEvaluation } from './state.ts';
import { levelOfCompetition } from './pyramid.ts';

const PROFILES: ClubProfile[] = ['akademie', 'majitel', 'město'];

/** Offers at the start of a career: A-teams of the 3rd level, each with a profile. */
export function careerStartOffers(data: GameData, seed: string): JobOffer[] {
  const rng = new Rng(`${seed}/career-start`);
  const clubs = rng.shuffle(data.clubs.filter((c) => !c.parentClubId && levelOfCompetition(data, c.competitionId) === 3));
  return clubs.slice(0, data.balance.career.startOffers).map((c, i) => {
    const profile = PROFILES[i % PROFILES.length] as ClubProfile;
    return { clubId: c.id, profile, text: `${c.name} (${c.city}) – ${data.balance.career.profiles[profile].label}` };
  });
}

export function initCoach(state: GameState, data: GameData, opts: { mode: 'career' | 'free'; background?: CoachBackground; profile?: ClubProfile }): void {
  const c = data.balance.career;
  const id = state.userClubId;
  if (!id) return;
  const level = levelOf(state, data, id);
  const background = opts.mode === 'career' ? (opts.background ?? 'hráč') : null;
  state.coach = {
    mode: opts.mode,
    background,
    reputation: background ? c.backgrounds[background].reputation : c.freeStartReputation[`${level}`],
    history: [],
    offers: [],
    sacked: false,
  };
  if (background) applyEffects(state, data, c.backgrounds[background].effects, state.date);
  if (opts.profile) applyProfile(state, data, opts.profile);
}

/** Club profile from the career start (design: poor club with a strong academy, ambitious owner, good city). */
function applyProfile(state: GameState, data: GameData, profile: ClubProfile): void {
  const p = data.balance.career.profiles[profile];
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!id || !f) return;
  f.cash = Math.round((f.cash * p.cashFactor) / 1000) * 1000;
  if (p.academyPotBonus > 0)
    for (const pl of state.players) if (pl.clubId === id && pl.academy) pl.pot = Math.min(data.balance.potential.max, pl.pot + p.academyPotBonus);
  applyEffects(state, data, p.effects, state.date);
}

/** Minimum reputation for a job at a club. */
export function requiredReputation(state: GameState, data: GameData, club: Club): number {
  const level: Level = state.membership[club.id] ? levelOfCompetition(data, state.membership[club.id]!) : 3;
  return data.balance.career.required[`${level}`][`${club.size}`];
}

/** End of a season: history, reputation, sacking or offers from other clubs. */
export function coachSeasonEnd(
  state: GameState,
  data: GameData,
  info: { evaluation: SeasonEvaluation | null; movement: Movement | undefined; title: boolean; cupWin: boolean },
  news: NewsItem[],
): void {
  const coach = state.coach;
  const id = state.userClubId;
  if (!coach || !id) return;
  const c = data.balance.career;
  const e = info.evaluation;
  coach.history.push({ seasonYear: state.seasonYear, clubId: id, competitionId: state.membership[id] ?? null, position: e?.leaguePosition ?? null, grade: e?.overall ?? null });
  let delta = e ? (c.reputationByGrade[e.overall] ?? 0) : 0;
  const mv = info.movement;
  if (mv?.from && mv.to) delta += levelOfCompetition(data, mv.to) < levelOfCompetition(data, mv.from) ? c.reputationBonus.promotion : c.reputationBonus.relegation;
  if (info.title) delta += c.reputationBonus.title;
  if (info.cupWin) delta += c.reputationBonus.cupWin;
  coach.reputation = Math.max(0, Math.min(100, coach.reputation + delta));

  const rng = new Rng(`${state.seed}/career/${state.seasonYear}`);
  const grades = state.board?.grades ?? [];
  if (wouldBeSacked(grades, data)) {
    coach.sacked = true;
    coach.reputation = Math.max(0, coach.reputation - c.sackedReputationLoss);
    coach.offers = jobOffers(state, data, rng, { count: c.sackedOffers, lowerOnly: true });
    news.push({ date: state.date, kind: 'season', text: `Vedení s tebou po sezóně ukončilo spolupráci. Vyber si nové angažmá (Kariéra).` });
    return;
  }
  const chance = e ? (c.offerChanceByGrade[e.overall] ?? 0) : 0;
  coach.offers = rng.chance(chance) ? jobOffers(state, data, rng, { count: rng.int(1, c.maxOffers), lowerOnly: false }) : [];
  if (coach.offers.length > 0) news.push({ date: state.date, kind: 'season', text: `Máš ${coach.offers.length === 1 ? 'nabídku' : 'nabídky'} od jiných klubů (Kariéra). Odmítnout je můžeš.` });
}

/** Offers from clubs that would take the coach: bigger ones after success, any after the sack. */
function jobOffers(state: GameState, data: GameData, rng: Rng, opts: { count: number; lowerOnly: boolean }): JobOffer[] {
  const coach = state.coach;
  const id = state.userClubId;
  if (!coach || !id) return [];
  const myLevel = levelOf(state, data, id);
  const mySize = data.clubs.find((x) => x.id === id)?.size ?? 1;
  const candidates = data.clubs.filter((club) => {
    if (club.parentClubId || club.id === id || !state.membership[club.id]) return false;
    if (requiredReputation(state, data, club) > coach.reputation) return false;
    const level = levelOf(state, data, club.id);
    if (opts.lowerOnly) return level >= myLevel || club.size <= mySize;
    // A step up: a higher competition, or a bigger club in the same one.
    return level < myLevel || (level === myLevel && club.size > mySize);
  });
  const fallback = data.clubs.filter((club) => !club.parentClubId && club.id !== id && state.membership[club.id] && levelOf(state, data, club.id) === 3);
  const pool = candidates.length > 0 ? candidates : opts.lowerOnly ? fallback : [];
  return rng
    .shuffle(pool)
    .slice(0, opts.count)
    .map((club) => ({ clubId: club.id, text: `${club.name} (${data.competitions.find((x) => x.id === state.membership[club.id])?.shortName ?? ''})` }));
}

/** The manager takes over another club (at the start of a season). */
export function changeClub(state: GameState, data: GameData, clubId: string, news: NewsItem[]): string {
  const coach = state.coach;
  const club = data.clubs.find((c) => c.id === clubId);
  if (!coach || !club || !coach.offers.some((o) => o.clubId === clubId)) return 'Nabídka už neplatí.';
  const old = data.clubs.find((c) => c.id === state.userClubId);
  // Open negotiations of the old club end.
  for (const o of state.market.offers) if ((o.buyerId === state.userClubId || o.sellerId === state.userClubId) && ['open', 'countered', 'agreed', 'pending'].includes(o.status)) o.status = 'withdrawn';
  for (const p of state.players) if (p.clubId === state.userClubId) delete p.listed;
  state.userClubId = clubId;
  invalidateRuntime(state);
  state.user = initialUserTeam(squadOf(state, clubId), data);
  state.board = null;
  startBoardSeason(state, data);
  state.club = initClub(state, data);
  state.transactions = [];
  state.scouting.scouts = [];
  coach.offers = [];
  coach.sacked = false;
  news.push({ date: state.date, kind: 'season', text: `Nové angažmá: ${club.name}${old ? ` (odchod z ${old.shortName})` : ''}.` });
  return `Vítej v klubu ${club.name}!`;
}

export function declineOffers(state: GameState): void {
  if (state.coach && !state.coach.sacked) state.coach.offers = [];
}

export type { CoachState };
