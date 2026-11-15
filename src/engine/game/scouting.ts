// Scouting (design, section 6; phase 6): what the manager knows about players. The level of a
// scout sets the accuracy (±) of the CEL and POT estimate; more observations narrow it
// (error / √n, combined as inverse variances). Estimates are deterministic, so they do not
// jump between screens, and always contain the true value.

import type { GameData } from '../data.ts';
import { overall } from '../players/rating.ts';
import type { Rng } from '../rng.ts';
import { FREE_AGENT, type Level, type Player } from '../types.ts';
import { squadOf } from './advance.ts';
import { daysBetween } from './calendar.ts';
import { exactAge, generateYouth } from './development.ts';
import { book, levelOf } from './finance.ts';
import { isUserOrg, unit } from './market.ts';
import type { GameState, Knowledge, NewsItem, Scout, ScoutLevel, ScoutingState } from './state.ts';

const LEVELS: ScoutLevel[] = ['začátečník', 'zkušený', 'elitní'];

export function emptyScouting(): ScoutingState {
  return { scouts: [], candidates: [], knowledge: {}, tips: [], nextId: 1 };
}

export function newScout(state: GameState, data: GameData, level: ScoutLevel, rng: Rng, name?: string): Scout {
  return {
    id: `S${state.scouting.nextId++}`,
    name: name ?? `${rng.pick(data.names.firstNames)} ${rng.pick(data.names.lastNames)}`,
    level,
    salary: data.balance.scouting.levels[level].salary,
    task: null,
  };
}

/** Candidates on the market for scouts (refreshed every July). */
export function refreshCandidates(state: GameState, data: GameData, rng: Rng): void {
  const keep = state.scouting.candidates.filter((c) => c.name.includes('(bývalý hráč)'));
  state.scouting.candidates = [...keep];
  for (let i = 0; i < data.balance.scouting.candidates; i++) {
    const r = rng.fork(`cand:${i}`);
    state.scouting.candidates.push(newScout(state, data, r.weightedPick(LEVELS, [3, 2, 1]), r));
  }
}

export interface Estimate {
  /** ± of the POT estimate (CEL is half of it); 0 = exact. */
  accuracy: number;
  cel: [number, number];
  pot: [number, number];
}

function range(truth: number, acc: number, key: string, lo = 1, hi = 100): [number, number] {
  if (acc <= 0) return [truth, truth];
  const mid = truth + (unit(key) - 0.5) * acc;
  return [Math.max(lo, Math.round(mid - acc / 2)), Math.min(hi, Math.round(mid + acc / 2))].sort((a, b) => a - b) as [number, number];
}

/** Accuracy of what the manager knows about a player (null = unknown). */
export function accuracyOf(state: GameState, data: GameData, p: Player): number | null {
  const s = data.balance.scouting;
  if (isUserOrg(state, data, p.clubId) || (p.loan && isUserOrg(state, data, p.loan.fromClubId))) return s.ownAccuracy;
  const k = state.scouting.knowledge[p.id];
  const club = p.loan?.fromClubId ?? p.clubId;
  const level: Level | null = club === FREE_AGENT ? null : levelOf(state, data, club);
  const pub = level && !p.academy ? (s.publicAccuracy[`${level}`] ?? null) : null;
  const candidates = [k?.accuracy, pub].filter((x): x is number => typeof x === 'number');
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** The manager's estimate of CEL and POT (design: exact POT is never shown). */
export function estimateOf(state: GameState, data: GameData, p: Player): Estimate | null {
  const acc = accuracyOf(state, data, p);
  if (acc === null) return null;
  const cel = overall(p, data.balance);
  const own = isUserOrg(state, data, p.clubId);
  const key = `${state.seed}/est/${p.id}/${acc}`;
  return {
    accuracy: acc,
    cel: own ? [cel, cel] : range(cel, Math.round(acc / 2), `${key}/cel`),
    pot: range(Math.max(cel, Math.round(p.pot)), 2 * acc, `${key}/pot`, cel),
  };
}

export function observe(state: GameState, playerId: string, accuracy: number, times: number, date: string): void {
  const k: Knowledge = state.scouting.knowledge[playerId] ?? { celGuess: 0, potGuess: 0, accuracy: 99, observations: 0, updated: date };
  const weight = (k.accuracy < 99 ? 1 / k.accuracy ** 2 : 0) + times / accuracy ** 2;
  k.accuracy = Math.max(1, Math.round(1 / Math.sqrt(weight)));
  k.observations += times;
  k.updated = date;
  state.scouting.knowledge[playerId] = k;
}

/** Monthly: salaries, observations by task, tips on young talents. */
export function scoutingTick(state: GameState, data: GameData, date: string, rng: Rng, out: NewsItem[]): void {
  const s = data.balance.scouting;
  const userId = state.userClubId;
  if (!userId) return;
  if (date.slice(5, 7) === '07') refreshCandidates(state, data, rng.fork('candidates'));
  for (const scout of state.scouting.scouts) {
    book(state, userId, 'staff', -scout.salary, date, `plat skauta: ${scout.name}`);
    const task = scout.task;
    if (!task) continue;
    const acc = s.levels[scout.level].accuracy;
    const r = rng.fork(scout.id);
    if (task.kind === 'player') {
      const p = state.players.find((x) => x.id === task.playerId);
      if (p) observe(state, p.id, acc, 4, date);
      else scout.task = null;
      continue;
    }
    let pool: Player[];
    if (task.kind === 'competition') {
      const clubs = Object.entries(state.membership)
        .filter(([, c]) => c === task.competitionId)
        .map(([id]) => id);
      pool = clubs.flatMap((id) => squadOf(state, id)).filter((p) => !isUserOrg(state, data, p.clubId));
      if (task.focus === 'talents') pool = pool.filter((p) => exactAge(p.birthDate, date) <= 21);
      else pool = pool.filter((p) => !p.contract || p.contract.until <= `${state.seasonYear + 1}-06-30` || p.listed);
    } else {
      const clubs = data.clubs.filter((c) => c.regionId === task.regionId).map((c) => c.id);
      pool = state.players.filter((p) => clubs.includes(p.clubId) && !isUserOrg(state, data, p.clubId) && exactAge(p.birthDate, date) <= s.youthMaxAge);
      // Tips: a talent outside the academies.
      if (r.chance(s.tips.chancePerScoutMonth)) {
        const level = levelOf(state, data, userId);
        const size = data.clubs.find((c) => c.id === userId)?.size ?? 1;
        const youth = generateYouth(userId, level, size, state, data, r.fork('tip'), `tip-${state.scouting.nextId++}`);
        const [a0, a1] = s.tips.age;
        const age = r.int(a0, a1);
        youth.birthDate = `${state.seasonYear - age}${youth.birthDate.slice(4)}`;
        youth.pot = Math.min(data.balance.potential.max, youth.pot + r.int(s.tips.potBonus[0], s.tips.potBonus[1]));
        const cost = Math.round(r.int(s.tips.cost[0], s.tips.cost[1]) / 10000) * 10000;
        state.scouting.tips.push({ id: youth.id, date, regionId: task.regionId, scoutId: scout.id, player: youth, cost });
        observe(state, youth.id, acc, 2, date);
        out.push({ date, kind: 'scouting', text: `Skaut ${scout.name} doporučuje talent: ${youth.firstName} ${youth.lastName} (${age} let, ${data.regions.find((x) => x.id === task.regionId)?.name ?? ''}).` });
      }
    }
    for (let i = 0; i < s.observationsPerMonth && pool.length > 0; i++) observe(state, (pool[r.int(0, pool.length - 1)] as Player).id, acc, 1, date);
  }
  // Tips expire after three months.
  state.scouting.tips = state.scouting.tips.filter((t) => daysBetween(t.date, date) < 92);
  // Forget old knowledge of retired players.
  if (date.slice(5, 7) === '07') {
    const ids = new Set(state.players.map((p) => p.id));
    for (const id of Object.keys(state.scouting.knowledge)) if (!ids.has(id) && !id.startsWith('tip-')) delete state.scouting.knowledge[id];
  }
}

export function hireScout(state: GameState, data: GameData, candidateId: string): string | null {
  if (state.scouting.scouts.length >= data.balance.scouting.maxScouts) return `Víc než ${data.balance.scouting.maxScouts} skautů klub nezaměstná.`;
  const c = state.scouting.candidates.find((x) => x.id === candidateId);
  if (!c) return 'Kandidát už není k dispozici.';
  state.scouting.candidates = state.scouting.candidates.filter((x) => x.id !== candidateId);
  state.scouting.scouts.push(c);
  return null;
}

export function fireScout(state: GameState, scoutId: string): void {
  state.scouting.scouts = state.scouting.scouts.filter((s) => s.id !== scoutId);
}

export function setScoutTask(state: GameState, scoutId: string, task: Scout['task']): void {
  const s = state.scouting.scouts.find((x) => x.id === scoutId);
  if (s) s.task = task;
}

/** Accepting a tip: the club pays, the parents may still say no. */
export function acceptTip(state: GameState, data: GameData, tipId: string, rng: Rng): { ok: boolean; message: string } {
  const tip = state.scouting.tips.find((t) => t.id === tipId);
  const userId = state.userClubId;
  if (!tip || !userId) return { ok: false, message: 'Tip už neplatí.' };
  const f = state.finances[userId];
  if (f && f.cash < tip.cost) return { ok: false, message: 'Na to klub nemá peníze.' };
  state.scouting.tips = state.scouting.tips.filter((t) => t.id !== tipId);
  book(state, userId, 'academy', -tip.cost, state.date, `nábor talentu: ${tip.player.firstName} ${tip.player.lastName}`);
  if (!rng.chance(data.balance.scouting.tips.persuadeChance)) return { ok: false, message: `Rodiče ${tip.player.lastName}a nakonec odmítli, peníze za jednání propadly.` };
  const n = state.players.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, '')) || 0), 0) + 1;
  const id = `p${String(n).padStart(5, '0')}`;
  const player: Player = { ...tip.player, id, clubId: userId, academy: true, contract: { wage: data.balance.economy.wages.academyMonthly[`${levelOf(state, data, userId)}`], until: `${state.seasonYear + 3}-06-30` } };
  state.players.push(player);
  return { ok: true, message: `${player.firstName} ${player.lastName} přichází do akademie.` };
}

export function declineTip(state: GameState, tipId: string): void {
  state.scouting.tips = state.scouting.tips.filter((t) => t.id !== tipId);
}

/** A retiring player of the manager may stay as a scout (design: CSM addition, phase 6). */
export function exPlayerScoutOffer(state: GameState, data: GameData, p: Player, rng: Rng): Scout | null {
  const s = data.balance.scouting.exPlayerScout;
  if (!rng.chance(data.balance.retirement.staffOffer.chance)) return null;
  const insight = (p.attributes.decisions + p.attributes.positioning) / 2;
  const level: ScoutLevel = insight >= s.eliteFrom ? 'elitní' : insight >= s.experiencedFrom ? 'zkušený' : 'začátečník';
  const scout = newScout(state, data, level, rng, `${p.firstName} ${p.lastName} (bývalý hráč)`);
  state.scouting.candidates.push(scout);
  return scout;
}
