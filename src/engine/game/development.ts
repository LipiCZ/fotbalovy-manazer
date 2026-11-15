// Player development (design, section 5): monthly growth, ageing, academy intake, retirement and
// AI squad management (moving players between A-team, B-team and academy – no transfers yet).

import type { Balance, GameData, PositionGroup, TrainingIntensity } from '../data.ts';
import {
  birthDateForAge,
  generateAttributes,
  generateHidden,
  generatePlayer,
  interpolate,
  pickPositions,
} from '../players/generate.ts';
import { overall } from '../players/rating.ts';
import type { Rng } from '../rng.ts';
import { GK_TECH, OUTFIELD_TECH, PHYSICAL, type AttributeId, type Level, type Player, type Position } from '../types.ts';
import type { GameState, NewsItem } from './state.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const nameOf = (p: Player) => `${p.firstName} ${p.lastName}`;
const DAY = 86_400_000;

/** Age in years with fractions. */
export function exactAge(birthDate: string, onDate: string): number {
  return (Date.parse(`${onDate}T00:00:00Z`) - Date.parse(`${birthDate}T00:00:00Z`)) / (365.25 * DAY);
}

// ---------------------------------------------------------------- growth factors

/** Annual growth (CEL) at a given age with full minutes and average form. */
export function annualBase(age: number, balance: Balance): number {
  return interpolate(balance.development.annualByAge, age);
}

/** Form multiplier from the design table (average of the last 10 ratings). */
export function formMultiplierFor(avgRating: number | null, balance: Balance): number {
  if (avgRating === null) return 1;
  for (const [threshold, mult] of balance.development.formMultiplier) if (avgRating >= threshold) return mult;
  return balance.development.formMultiplier.at(-1)?.[1] ?? 1;
}

export function averageRecent(player: Player, n: number): number | null {
  const r = player.state.recentRatings.slice(-n);
  return r.length >= 3 ? r.reduce((s, x) => s + x, 0) / r.length : null;
}

/**
 * Minutes multiplier: bench + (1 − bench) × share^exponent × level factor. A player grows fastest in a
 * competition slightly stronger than himself (design, section 5).
 */
export function minutesMultiplier(share: number, playerCel: number, leagueCel: number, balance: Balance): number {
  const m = balance.development.minutes;
  const diff = leagueCel - playerCel;
  let level = 1;
  if (diff < m.levelOptimum[0]) level = 1 - (m.levelOptimum[0] - diff) * m.levelTooWeakPerPoint;
  else if (diff > m.levelOptimum[1]) level = 1 - (diff - m.levelOptimum[1]) * m.levelTooStrongPerPoint;
  level = clamp(level, m.levelMin, 1);
  return m.bench + (1 - m.bench) * clamp(share, 0, 1) ** m.shareExponent * level;
}

export interface GrowthInput {
  age: number;
  cel: number;
  pot: number;
  minutesShare: number;
  leagueCel: number;
  /** Average of the recent ratings (null = unknown). */
  formRating: number | null;
  training: TrainingIntensity;
  professionalism: number;
  /** false when the player has been out of form for 1.5 seasons (design, section 5). */
  confident: boolean;
}

/** Growth of CEL in one month. */
export function monthlyGrowth(i: GrowthInput, balance: Balance): number {
  const d = balance.development;
  const base = annualBase(i.age, balance) / 12;
  const prof = d.professionalism.min + ((d.professionalism.max - d.professionalism.min) * i.professionalism) / 100;
  if (base <= 0) return base * (2 - prof); // professionals decline slower
  if (!i.confident) return 0;
  const potential = clamp((i.pot - i.cel) / d.potentialSoftness, 0, 1);
  return (
    base *
    minutesMultiplier(i.minutesShare, i.cel, i.leagueCel, balance) *
    formMultiplierFor(i.formRating, balance) *
    balance.training[i.training].growth *
    prof *
    potential
  );
}

/** Spreads a CEL change over the attributes: TS/FS split by age, mostly into attributes the position uses. */
export function applyGrowth(player: Player, delta: number, age: number, balance: Balance, rng: Rng): void {
  const d = balance.development;
  const main = player.positions[0] as Position;
  const weights = balance.attributes.weights[main];
  const rating = balance.rating.byPosition[main];
  const tsShare = delta < 0 && age >= d.split.declineFrom ? d.split.declineTsShare : age <= d.split.youngUntil ? d.split.youngTsShare : d.split.primeTsShare;
  const groups: [readonly AttributeId[], Partial<Record<AttributeId, number>>, number, number][] = [
    [main === 'GK' ? GK_TECH : OUTFIELD_TECH, weights.tech, tsShare, rating.ts],
    [PHYSICAL, weights.phys, 1 - tsShare, rating.fs],
  ];
  for (const [ids, w, share, ratingWeight] of groups) {
    // Raising every used attribute of a group by x raises that group by x and CEL by ratingWeight·x.
    const x = (delta * share) / ratingWeight;
    for (const a of ids) {
      const used = (w[a] ?? 0) > 0;
      let change = x * (used ? 1 : d.irrelevantShare) * (1 + rng.normal(0, d.attributeNoise));
      if (delta < 0 && (a === 'pace' || a === 'acceleration' || a === 'stamina')) change *= 1.5;
      player.attributes[a] = round1(clamp(player.attributes[a] + change, 1, 99));
    }
  }
  if (age >= 30) player.attributes.decisions = round1(clamp(player.attributes.decisions + d.split.decisionsPerYearFrom30 / 12, 1, 99));
  if (age >= 28) player.leadership = round1(clamp(player.leadership + d.split.leadershipPerYearFrom28 / 12, 1, 99));
}

// ---------------------------------------------------------------- context helpers

/** Matches each club played this season (league, post-season, cup). */
export function clubMatchCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const c of state.competitions) for (const r of c.results) (add(r.homeId), add(r.awayId));
  for (const s of state.stages) for (const r of s.results) (add(r.homeId), add(r.awayId));
  for (const round of state.cup?.rounds ?? []) for (const t of round.ties) if (t.result) (add(t.result.homeId), add(t.result.awayId));
  return counts;
}

export function levelOf(state: GameState, clubId: string, data: GameData): Level | null {
  const comp = state.membership[clubId];
  return comp ? (data.competitions.find((c) => c.id === comp)?.level ?? null) : null;
}

/** Trainer setting of the manager's club resolved for a day (assistant: hard far from a match, light close to it). */
export function resolveTraining(setting: TrainingIntensity | 'assistant', daysToMatch: number | null, balance: Balance): TrainingIntensity {
  if (setting !== 'assistant') return setting;
  const a = balance.training.assistant;
  if (daysToMatch === null || daysToMatch >= a.hardIfDaysToMatch) return 'hard';
  if (daysToMatch <= a.lightIfDaysToMatch) return 'light';
  return 'normal';
}

// ---------------------------------------------------------------- monthly tick

export interface TickContext {
  date: string;
  /** Average starting-XI strength per club (to derive the level of each competition). */
  leagueCelOf: (clubId: string) => number;
  rng: Rng;
}

export function developmentTick(state: GameState, data: GameData, ctx: TickContext): NewsItem[] {
  const { balance } = data;
  const d = balance.development;
  const matches = clubMatchCounts(state);
  const news: NewsItem[] = [];
  const youthLeagueCel = (p: Player) => overall(p, balance) + d.minutes.levelOptimum[0] + 1;

  for (const p of state.players) {
    const age = exactAge(p.birthDate, ctx.date);
    const cel = overall(p, balance);
    const stats = state.playerStats[p.id];
    const last = p.career?.at(-1);
    let share: number;
    let formRating: number | null;
    let leagueCel: number;
    if (p.academy) {
      share = clamp(ctx.rng.normal(d.youth.minutesMean, d.youth.minutesSd), 0, 1);
      formRating = ctx.rng.normal(d.youth.ratingMean, d.youth.ratingSd);
      leagueCel = youthLeagueCel(p);
    } else {
      const played = matches.get(p.clubId) ?? 0;
      share = played >= 3 ? (stats?.minutes ?? 0) / (played * 90) : (last?.minutesShare ?? 0.3);
      formRating = averageRecent(p, d.formMatches);
      leagueCel = ctx.leagueCelOf(p.clubId);
    }
    // Confidence: out of form last season and this season (with enough matches) -> no growth.
    const seasonAvg = stats && stats.apps >= d.confidence.minApps ? stats.ratingSum / stats.apps : null;
    const lastAvg = last && last.apps >= d.confidence.minApps ? last.avgRating : null;
    const confident = !(seasonAvg !== null && lastAvg !== null && seasonAvg < d.confidence.threshold && lastAvg < d.confidence.threshold);
    const training: TrainingIntensity =
      p.clubId === state.userClubId && !p.academy && state.user && state.user.training !== 'assistant' ? state.user.training : 'normal';

    const delta = monthlyGrowth(
      { age, cel, pot: p.pot, minutesShare: share, leagueCel, formRating, training, professionalism: p.hidden.professionalism, confident },
      balance,
    );
    if (delta !== 0) applyGrowth(p, delta, age, balance, ctx.rng);
    const after = overall(p, balance);
    (p.celHistory ??= []).push(after);
    if (p.celHistory.length > 120) p.celHistory.splice(0, p.celHistory.length - 120);
    if (!p.academy) p.state.seniorMonths = (p.state.seniorMonths ?? 0) + 1;

    if (p.clubId === state.userClubId) {
      const before = p.celHistory.at(-4);
      if (before !== undefined && p.celHistory.length >= 4 && Math.abs(after - before) >= 3 && ctx.date.endsWith('-01')) {
        // Report notable changes over the last three months, once per quarter.
        const month = Number(ctx.date.slice(5, 7));
        if (month % 3 === 1)
          news.push({
            date: ctx.date,
            kind: 'development',
            playerId: p.id,
            text: after > before ? `${nameOf(p)} se výrazně zlepšil (CEL ${before} → ${after}).` : `${nameOf(p)} se zhoršil (CEL ${before} → ${after}).`,
          });
      }
    }
  }
  return news;
}

// ---------------------------------------------------------------- academy intake

/** Allocates new unique player ids for one operation (ids continue after the highest existing one). */
export function idAllocator(state: GameState): () => string {
  let n = state.players.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, '')) || 0), 0);
  return () => `p${String(++n).padStart(5, '0')}`;
}

/** A new academy player (birth date relative to 1 July of the current season). */
function generateYouth(clubId: string, level: Level, size: 1 | 2 | 3 | 4 | 5, state: GameState, data: GameData, rng: Rng, id: string): Player {
  const { balance } = data;
  const a = balance.academy;
  const template = balance.squad.templateByLevel['3'];
  const positions = Object.entries(template).flatMap(([pos, roles]) => roles.map(() => pos as Position));
  const main = rng.pick(positions);
  const age = rng.int(a.age[0], a.age[1]);
  const cel = clamp(rng.normal(a.celMeanByLevel[`${level}`] + a.celSizeOffset[`${size}`], a.celSd), 10, 70);
  const p = balance.profile;
  const tsTarget = cel + rng.normal(Math.max(0, p.youthTechBiasUntilAge - age) * p.youthTechBiasPerYear, p.tsMinusCelSd);
  const w = balance.rating.byPosition[main];
  const fsTarget = (cel - w.ts * tsTarget) / w.fs;
  const attributes = generateAttributes(main, clamp(tsTarget, 5, 90), clamp(fsTarget, 5, 90), balance, rng);
  let gap = Math.max(4, rng.normal(a.potGap.mean, a.potGap.sd));
  if (rng.chance(a.talentChance)) gap += rng.int(a.talentBonus[0], a.talentBonus[1]);
  const realCel = overall({ attributes, positions: [main] }, balance);
  return {
    id,
    firstName: rng.pick(data.names.firstNames),
    lastName: rng.pick(data.names.lastNames),
    birthDate: birthDateForAge(age, state.seasonYear, rng),
    positions: pickPositions(main, balance, rng),
    attributes,
    leadership: clamp(Math.round(rng.normal(30, 12)), 1, 99),
    hidden: generateHidden(age, balance, rng),
    pot: clamp(Math.round(realCel + gap), realCel, balance.potential.max),
    clubId,
    state: { condition: 100, recentRatings: [], suspensionMatches: 0, yellowCards: 0, seniorMonths: 0 },
    academy: true,
    career: [],
    celHistory: [realCel],
  };
}

/** Academy intake of every A-team in the pyramid (January and July). */
export function academyIntake(state: GameState, data: GameData, date: string, rng: Rng): NewsItem[] {
  const news: NewsItem[] = [];
  const a = data.balance.academy;
  const newId = idAllocator(state);
  for (const club of data.clubs) {
    if (club.parentClubId || !state.membership[club.id]) continue;
    const level = levelOf(state, club.id, data) ?? 3;
    const clubRng = rng.fork(club.id);
    const n = clubRng.int(a.perIntake[0], a.perIntake[1]);
    const youths: Player[] = [];
    for (let i = 0; i < n; i++) youths.push(generateYouth(club.id, level, club.size, state, data, clubRng, newId()));
    state.players.push(...youths);
    if (club.id === state.userClubId) {
      const best = [...youths].sort((x, y) => y.pot - x.pot)[0];
      news.push({
        date,
        kind: 'academy',
        ...(best ? { playerId: best.id } : {}),
        text: `Do akademie přišlo ${n} dorostenců. Trenéři mládeže nejvíc chválí ${best ? nameOf(best) : '–'}.`,
      });
    }
  }
  return news;
}

// ---------------------------------------------------------------- retirement

export interface RetirementInput {
  age: number;
  position: Position;
  /** Average rating of the finished season (null without matches). */
  avgRating: number | null;
  minutesShare: number;
  level: Level | null;
  professionalism: number;
  /** Days of injury that started during the season. */
  injuryDays: number;
  /** From phase 6: contract valid for the next season too. */
  contractNextSeason?: boolean;
}

/** Position group of a player for the retirement table. */
export function positionGroup(position: Position, balance: Balance): PositionGroup {
  const groups = balance.retirement.positionGroups;
  return ((Object.keys(groups) as PositionGroup[]).find((g) => groups[g].includes(position)) ?? 'MF') as PositionGroup;
}

/** Base chance from the table: the closest lower listed age applies, beyond the last one 100 %. */
export function baseRetirementChance(age: number, group: PositionGroup, balance: Balance): number {
  const table = balance.retirement.byPosition[group];
  const whole = Math.floor(age);
  let chance = 0;
  for (const [a, c] of table) if (whole >= a) chance = c;
  const last = table.at(-1);
  if (last && whole > last[0]) chance = 1;
  return chance;
}

/** Chance that a player ends his career at the end of the season (design, section 5). */
export function retirementChance(i: RetirementInput, balance: Balance): number {
  const m = balance.retirement.multipliers;
  let p = baseRetirementChance(i.age, positionGroup(i.position, balance), balance);
  if (p <= 0) return 0;
  if (i.avgRating !== null && i.avgRating >= m.superSeason.minAvgRating && i.minutesShare >= m.superSeason.minMinutesShare) p *= m.superSeason.factor;
  if (i.contractNextSeason) p *= m.contractNextSeason.factor;
  if (i.level === 3) p *= m.thirdLevel.factor;
  if (i.professionalism >= m.highProfessionalism.minProfessionalism) p *= m.highProfessionalism.factor;
  if (i.minutesShare < m.fewMinutes.maxMinutesShare) p *= m.fewMinutes.factor;
  if (i.injuryDays > m.longInjury.minDays) p *= m.longInjury.factor;
  return clamp(p, 0, 1);
}

// ---------------------------------------------------------------- squad management (AI)

export interface SquadContext {
  date: string;
  leagueCelOf: (clubId: string) => number;
  rng: Rng;
}

function seniorSquad(state: GameState, clubId: string): Player[] {
  return state.players.filter((p) => p.clubId === clubId && !p.academy);
}

function remove(state: GameState, ids: Set<string>): void {
  if (ids.size === 0) return;
  state.players = state.players.filter((p) => !ids.has(p.id));
}

/**
 * Keeps squads within limits by moving players between academy, B-team and A-team, releasing
 * surplus players and – when a club has nobody left to promote – signing a free player of the
 * competition's level (a stand-in until transfers exist in phase 6).
 * The manager's club only gets automatic academy releases; the rest is his decision.
 */
export function manageSquads(state: GameState, data: GameData, ctx: SquadContext): NewsItem[] {
  const { balance } = data;
  const a = balance.academy;
  const news: NewsItem[] = [];
  const released = new Set<string>();
  const newId = idAllocator(state);
  const age = (p: Player) => exactAge(p.birthDate, ctx.date);
  const cel = (p: Player) => overall(p, balance);
  const byCelDesc = (x: Player, y: Player) => cel(y) - cel(x) || x.id.localeCompare(y.id);
  const kv = balance.squads.keepValue;
  /** Whom to keep: current level, plus part of the potential, minus age. */
  const keepValue = (p: Player) => cel(p) + kv.youthWeight * Math.max(0, p.pot - cel(p)) - kv.agePenalty * Math.max(0, age(p) - 30);
  const byKeepAsc = (x: Player, y: Player) => keepValue(x) - keepValue(y) || x.id.localeCompare(y.id);

  for (const club of data.clubs) {
    if (club.parentClubId) continue;
    const isUser = club.id === state.userClubId;
    const bClub = data.clubs.find((c) => c.parentClubId === club.id && state.membership[c.id]);
    const levelA = levelOf(state, club.id, data);
    if (!levelA) continue;
    const limitsA = balance.squads.byLevel[`${levelA}`];
    const levelB = bClub ? levelOf(state, bClub.id, data) : null;
    const limitsB = levelB ? balance.squads.byLevel[`${levelB}`] : null;
    const academy = () => state.players.filter((p) => p.clubId === club.id && p.academy && !released.has(p.id));
    const squadA = () => seniorSquad(state, club.id).filter((p) => !released.has(p.id));
    const squadB = () => (bClub ? seniorSquad(state, bClub.id).filter((p) => !released.has(p.id)) : []);

    // Academy players too old for the youth team are released (also for the manager's club).
    for (const p of academy()) {
      if (age(p) >= a.releaseAtAge) {
        released.add(p.id);
        if (isUser) news.push({ date: ctx.date, kind: 'academy', text: `${nameOf(p)} (${Math.floor(age(p))}) odchází z akademie, do kádru se neprosadil.` });
      }
    }
    if (isUser) continue;

    // Promote academy players who are better than the weakest senior.
    for (const p of academy().filter((x) => age(x) >= a.promoteFromAge).sort(byCelDesc)) {
      const sa = squadA();
      const worstA = sa.length > 0 ? Math.min(...sa.map(cel)) : 0;
      if (sa.length < limitsA.min || (sa.length < limitsA.max && cel(p) > worstA)) {
        p.academy = false;
        continue;
      }
      if (bClub && limitsB) {
        const sb = squadB();
        const worstB = sb.length > 0 ? Math.min(...sb.map(cel)) : 0;
        if (sb.length < limitsB.min || (sb.length < limitsB.max && cel(p) > worstB)) {
          p.academy = false;
          p.clubId = bClub.id;
        }
      }
    }
    // The best B-team players move up when they are better than the weakest of the A-team.
    if (bClub) {
      for (let i = 0; i < balance.squads.maxSwapsPerWindow; i++) {
        const bestB = squadB().filter((p) => p.positions[0] !== 'GK').sort(byCelDesc)[0];
        const worstA = squadA().filter((p) => p.positions[0] !== 'GK').sort((x, y) => cel(x) - cel(y))[0];
        if (!bestB || !worstA || cel(bestB) < cel(worstA) + balance.squads.promoteFromBMargin) break;
        bestB.clubId = club.id;
        if (age(worstA) <= 23) worstA.clubId = bClub.id;
        else released.add(worstA.id);
      }
    }

    // Academy size.
    const acad = academy();
    if (acad.length > a.maxSize) for (const p of [...acad].sort((x, y) => x.pot - y.pot).slice(0, acad.length - a.maxSize)) released.add(p.id);

    // A-team too big: young surplus to the B-team, otherwise release the weakest.
    let sa = squadA();
    while (sa.length > limitsA.max) {
      const gks = sa.filter((p) => p.positions[0] === 'GK').length;
      const candidates = sa.filter((p) => p.positions[0] !== 'GK' || gks > balance.squads.minGoalkeepers).sort(byKeepAsc);
      const worst = candidates[0];
      if (!worst) break;
      if (bClub && limitsB && age(worst) <= 23 && squadB().length < limitsB.max) worst.clubId = bClub.id;
      else released.add(worst.id);
      sa = squadA();
    }
    // A-team too small: best of the B-team, then of the academy, then a free player.
    const fill = (squad: () => Player[], min: number, targetClub: string, sources: (() => Player[])[], reserve: boolean) => {
      let guard = 0;
      while (squad().length < min && guard++ < 40) {
        const gkNeeded = squad().filter((p) => p.positions[0] === 'GK').length < balance.squads.minGoalkeepers;
        let pick: Player | undefined;
        for (const src of sources) {
          pick = src()
            .filter((p) => !gkNeeded || p.positions[0] === 'GK')
            .sort(byCelDesc)[0];
          if (pick) break;
        }
        if (pick) {
          pick.academy = false;
          pick.clubId = targetClub;
        } else {
          const strength = ctx.leagueCelOf(targetClub);
          const main: Position = gkNeeded ? 'GK' : ctx.rng.pick(['CB', 'CM', 'ST', 'LB', 'RW'] as Position[]);
          const p = generatePlayer(
            { clubId: targetClub, main, role: 'R', targetMean: strength, reserve },
            newId(),
            state.seasonYear,
            data,
            ctx.rng,
          );
          const { role: _role, ...player } = p;
          void _role;
          state.players.push({ ...player, state: { ...player.state, seniorMonths: 24 }, career: [], celHistory: [overall(player, balance)] });
        }
      }
    };
    fill(squadA, limitsA.min, club.id, [squadB, () => academy().filter((p) => age(p) >= 16)], false);
    // Until transfers exist (phase 6): a club far below its target strength signs free players.
    const target = balance.strength.starterMeanByLevel[`${levelA}`] + balance.strength.sizeOffset[`${club.size}`];
    const fa = balance.squads.freeAgents;
    for (let i = 0; i < fa.maxPerWindow; i++) {
      const top11 = squadA().map(cel).sort((x, y) => y - x).slice(0, 11);
      const strength = top11.reduce((s, v) => s + v, 0) / Math.max(1, top11.length);
      if (strength >= target - fa.anchorGap) break;
      const main = ctx.rng.pick(['CB', 'CM', 'ST', 'LB', 'RW', 'DM', 'AM'] as Position[]);
      const signed = generatePlayer({ clubId: club.id, main, role: 'S', targetMean: target, reserve: false }, newId(), state.seasonYear, data, ctx.rng);
      const { role: _r, ...player } = signed;
      void _r;
      state.players.push({ ...player, state: { ...player.state, seniorMonths: 60 }, career: [], celHistory: [overall(player, balance)] });
      const weakest = squadA().filter((p) => p.id !== player.id && p.positions[0] !== 'GK').sort(byKeepAsc)[0];
      if (weakest && squadA().length > limitsA.max) released.add(weakest.id);
    }
    // Goalkeepers in the A-team.
    if (squadA().filter((p) => p.positions[0] === 'GK').length < balance.squads.minGoalkeepers)
      fill(() => squadA().filter((p) => p.positions[0] === 'GK'), balance.squads.minGoalkeepers, club.id, [squadB, academy], false);

    if (bClub && limitsB && levelB) {
      // B-teams are for young players: older ones who did not make the A-team leave (if the squad allows).
      for (const p of squadB().filter((x) => age(x) >= balance.squads.reserveMaxAge).sort(byKeepAsc)) {
        if (squadB().length <= limitsB.min) break;
        released.add(p.id);
      }
      let sb = squadB();
      while (sb.length > limitsB.max) {
        const worst = [...sb].sort(byKeepAsc)[0];
        if (!worst) break;
        released.add(worst.id);
        sb = squadB();
      }
      fill(squadB, limitsB.min, bClub.id, [() => academy().filter((p) => age(p) >= 16)], true);
    }
  }
  remove(state, released);
  return news;
}
