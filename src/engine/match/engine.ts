// Match engine (design, section 12). Chances are simulated, not pitch physics.
//
// The engine is a stepper: createMatch() -> stepMinute() until finished -> finishMatch().
// Quick mode (playMatch) loops through all minutes with the assistant making decisions for both
// teams; the live mode (phase 8) will pause between steps and let the player change tactics.

import type { Balance, Band, Formation, Mentality } from '../data.ts';
import { positionFit, slotValue, type Tactics, type TeamSheet } from '../lineup.ts';
import { ageOn, celAt, fsAt, tsAt } from '../players/rating.ts';
import type { Rng } from '../rng.ts';
import type { Level, Player, Position } from '../types.ts';
import { explainMatch } from './explain.ts';
import { computeRatings } from './ratings.ts';
import type { MatchEvent, MatchReport, PlayerMatchLine, Side, TeamMatchStats } from './types.ts';

export interface MatchContext {
  level: Level;
  balance: Balance;
  formations: readonly Formation[];
  rng: Rng;
  /** False for a neutral venue (e.g. a cup final). */
  homeAdvantage?: boolean;
  /** When true the assistant decides substitutions and mentality changes for this side. */
  autopilot?: Record<Side, boolean>;
  /** Match date (ISO); enables the adaptation penalty of young players. */
  date?: string;
  /**
   * Knockout match: when level after 90 minutes, extra time (2 × 15) and penalties follow.
   * For the second leg of a two-legged tie pass the first leg's goals (from this match's home/away view).
   */
  knockout?: { firstLeg?: { home: number; away: number } };
}

interface OnPitch {
  player: Player;
  line: PlayerMatchLine;
  slot: Position;
  fit: number;
  ts: number;
  fs: number;
  speed: number;
  cel: number;
  /** Goalkeeping ability (TS as a goalkeeper). */
  gk: number;
  shoot: number;
  header: number;
  condition: number;
  formFactor: number;
  /** Condition drain multiplier by age (older players tire faster). */
  fatigue: number;
  /** Injury risk multiplier (higher shortly after returning from an injury). */
  injuryRisk: number;
}

interface TeamState {
  side: Side;
  sheet: TeamSheet;
  pitch: (OnPitch | null)[];
  bench: Player[];
  tactics: Tactics;
  baseMentality: Mentality;
  subsUsed: number;
  windowMinutes: Set<number>;
  stats: TeamMatchStats;
  possessionSteps: number;
  bands: Record<Band, number> & { gk: number };
}

export interface MatchState {
  ctx: MatchContext;
  step: number;
  length: number;
  /** Length of regular time incl. added time (extra time follows after it). */
  regularLength: number;
  extraTime: boolean;
  penalties?: [number, number];
  addedFirst: number;
  addedSecond: number;
  home: TeamState;
  away: TeamState;
  events: MatchEvent[];
  lines: PlayerMatchLine[];
  bandNorm: Record<Band, number>;
  finished: boolean;
}

const BANDS: Band[] = ['def', 'mid', 'att'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function emptyStats(): TeamMatchStats {
  return { goals: 0, shots: 0, shotsOnTarget: 0, xg: 0, possession: 0, fouls: 0, yellow: 0, red: 0, corners: 0, penalties: 0, penaltiesScored: 0, subs: 0 };
}

function formFactor(player: Player, balance: Balance): number {
  const f = balance.form;
  const recent = player.state.recentRatings.slice(-f.window);
  // After an injury the form is worse for a few matches (design, section 12).
  const returnPenalty = (player.state.returnFormMatches ?? 0) > 0 ? balance.injuries.afterReturn.formRatingPenalty : 0;
  if (recent.length === 0) return 1 + clamp(-returnPenalty * f.effectPerPoint, -f.maxEffect, f.maxEffect);
  const avg = recent.reduce((s, r) => s + r, 0) / recent.length - returnPenalty;
  return 1 + clamp((avg - f.neutral) * f.effectPerPoint, -f.maxEffect, f.maxEffect);
}

function interpolatePoints(points: [number, number][], x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 1;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    const [x0, y0] = points[i - 1] as [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Young players in their first months of senior football perform a little worse (design, section 5). */
function adaptationFactor(player: Player, date: string | undefined, balance: Balance): number {
  if (!date) return 1;
  const a = balance.development.adaptation;
  if (ageOn(player.birthDate, date) > a.untilAge) return 1;
  const needed = a.minMonths + ((100 - player.hidden.adaptation) / 100) * (a.maxMonths - a.minMonths);
  const months = player.state.seniorMonths ?? needed;
  return months >= needed ? 1 : 1 - a.penalty * (1 - months / needed);
}

function makeOnPitch(player: Player, slot: Position, line: PlayerMatchLine, balance: Balance, date?: string): OnPitch {
  const a = player.attributes;
  return {
    player,
    line,
    slot,
    fit: positionFit(player, slot, balance),
    ts: tsAt(player, slot, balance),
    fs: fsAt(player, slot, balance),
    speed: (a.pace + a.acceleration) / 2,
    cel: celAt(player, slot, balance),
    gk: tsAt(player, 'GK', balance),
    shoot: 0.6 * a.finishing + 0.2 * a.technique + 0.2 * a.positioning,
    header: 0.6 * a.heading + 0.4 * a.jumping,
    condition: player.state.condition,
    formFactor: formFactor(player, balance) * adaptationFactor(player, date, balance),
    fatigue: date ? interpolatePoints(balance.condition.ageFatigue.byAge, ageOn(player.birthDate, date)) : 1,
    injuryRisk:
      date && player.state.reinjuryUntil && player.state.reinjuryUntil >= date ? balance.injuries.afterReturn.reinjuryMultiplier : 1,
  };
}

function newLine(player: Player, clubId: string, side: Side, slot: Position, started: boolean): PlayerMatchLine {
  return {
    playerId: player.id,
    clubId,
    side,
    slot,
    started,
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    saves: 0,
    conceded: 0,
    errors: 0,
    yellow: 0,
    red: 'none',
    conditionEnd: player.state.condition,
    rating: 0,
  };
}

function conditionFactor(condition: number, balance: Balance): number {
  return 1 - (balance.condition.effect * (100 - condition)) / 100;
}

function effectiveValue(op: OnPitch, team: TeamState, balance: Balance): number {
  const mix = balance.match.styleMix[team.tactics.style];
  return (
    (mix.ts * op.ts + mix.fs * op.fs + mix.speed * op.speed) *
    op.fit *
    conditionFactor(op.condition, balance) *
    op.formFactor
  );
}

function recomputeBands(state: MatchState, team: TeamState): void {
  const { balance } = state.ctx;
  const weights = balance.match.bands.byPosition;
  const sums: Record<Band, number> = { def: 0, mid: 0, att: 0 };
  let gk = 5;
  for (const op of team.pitch) {
    if (!op) continue;
    const eff = effectiveValue(op, team, balance);
    const w = weights[op.slot];
    for (const b of BANDS) sums[b] += (w[b] ?? 0) * eff;
    if (op.slot === 'GK') gk = op.gk * op.fit * conditionFactor(op.condition, balance);
  }
  const home = team.side === 'home' && state.ctx.homeAdvantage !== false ? 1 + balance.match.homeBonus : 1;
  team.bands = {
    def: (Math.max(1, sums.def) / state.bandNorm.def) * home,
    mid: (Math.max(1, sums.mid) / state.bandNorm.mid) * home,
    att: (Math.max(1, sums.att) / state.bandNorm.att) * home,
    gk: gk * home,
  };
}

function bandNorm(formations: readonly Formation[], balance: Balance): Record<Band, number> {
  const ref = formations.find((f) => f.id === balance.match.bands.referenceFormation);
  if (!ref) throw new Error(`Referenční rozestavení ${balance.match.bands.referenceFormation} neexistuje`);
  const norm: Record<Band, number> = { def: 0, mid: 0, att: 0 };
  for (const slot of ref.slots) for (const b of BANDS) norm[b] += balance.match.bands.byPosition[slot][b] ?? 0;
  return norm;
}

function initTeam(state: Pick<MatchState, 'lines' | 'ctx'>, sheet: TeamSheet, side: Side): TeamState {
  const { balance } = state.ctx;
  const pitch = sheet.lineup.map((p, i) => {
    if (!p) return null;
    const slot = sheet.slots[i] as Position;
    const line = newLine(p, sheet.clubId, side, slot, true);
    state.lines.push(line);
    return makeOnPitch(p, slot, line, balance, state.ctx.date);
  });
  return {
    side,
    sheet,
    pitch,
    bench: [...sheet.bench],
    tactics: { ...sheet.tactics },
    baseMentality: sheet.tactics.mentality,
    subsUsed: 0,
    windowMinutes: new Set(),
    stats: emptyStats(),
    possessionSteps: 0,
    bands: { def: 1, mid: 1, att: 1, gk: 1 },
  };
}

export function createMatch(home: TeamSheet, away: TeamSheet, ctx: MatchContext): MatchState {
  const { balance, rng } = ctx;
  const at = balance.match.addedTime;
  const addedFirst = rng.int(at.firstHalf[0], at.firstHalf[1]);
  const addedSecond = rng.int(at.secondHalf[0], at.secondHalf[1]);
  const half = balance.match.halfMinutes;
  const partial = { ctx, lines: [] as PlayerMatchLine[] };
  const state: MatchState = {
    ctx,
    step: 0,
    length: 2 * half + addedFirst + addedSecond,
    regularLength: 2 * half + addedFirst + addedSecond,
    extraTime: false,
    addedFirst,
    addedSecond,
    home: initTeam(partial, home, 'home'),
    away: initTeam(partial, away, 'away'),
    events: [],
    lines: partial.lines,
    bandNorm: bandNorm(ctx.formations, balance),
    finished: false,
  };
  recomputeBands(state, state.home);
  recomputeBands(state, state.away);
  return state;
}

/** Display minute for a step (1-based). */
export function clockOf(state: Pick<MatchState, 'addedFirst' | 'addedSecond' | 'ctx'>, step: number): { minute: number; added?: number } {
  const half = state.ctx.balance.match.halfMinutes;
  if (step <= half) return { minute: step };
  if (step <= half + state.addedFirst) return { minute: half, added: step - half };
  if (step <= 2 * half + state.addedFirst) return { minute: step - state.addedFirst };
  const regular = 2 * half + state.addedFirst + state.addedSecond;
  if (step <= regular) return { minute: 2 * half, added: step - 2 * half - state.addedFirst };
  return { minute: 2 * half + (step - regular) };
}

// ---------------------------------------------------------------- helpers

function other(state: MatchState, team: TeamState): TeamState {
  return team === state.home ? state.away : state.home;
}

function onPitch(team: TeamState): OnPitch[] {
  return team.pitch.filter((op): op is OnPitch => op !== null);
}

function pickWeighted(rng: Rng, ops: OnPitch[], weight: (op: OnPitch) => number): OnPitch | undefined {
  if (ops.length === 0) return undefined;
  const weights = ops.map((op) => Math.max(0, weight(op)));
  if (weights.every((w) => w === 0)) return rng.pick(ops);
  return rng.weightedPick(ops, weights);
}

function pushEvent(state: MatchState, ev: Omit<MatchEvent, 'minute' | 'added'>): MatchEvent {
  const clock = clockOf(state, state.step);
  const event: MatchEvent = { ...clock, ...ev };
  state.events.push(event);
  return event;
}

function goalkeeper(team: TeamState): OnPitch | undefined {
  const idx = team.sheet.slots.indexOf('GK');
  return team.pitch[idx] ?? undefined;
}

function score(state: MatchState, team: TeamState): number {
  return team.stats.goals - other(state, team).stats.goals;
}

// ---------------------------------------------------------------- substitutions & cards

function canSubstitute(state: MatchState, team: TeamState): boolean {
  const subs = state.ctx.balance.match.subs;
  if (team.subsUsed >= subs.max || team.bench.length === 0) return false;
  const minute = clockOf(state, state.step).minute;
  return team.windowMinutes.has(minute) || team.windowMinutes.size < subs.windows;
}

/** Replace the player in `slotIndex` (op may be null when the slot is empty) with the best bench fit. */
function substitute(state: MatchState, team: TeamState, slotIndex: number): boolean {
  if (!canSubstitute(state, team)) return false;
  const { balance } = state.ctx;
  const slot = team.sheet.slots[slotIndex] as Position;
  const candidates = team.bench.filter((p) => (slot === 'GK') === (p.positions[0] === 'GK'));
  const pool = candidates.length > 0 ? candidates : team.bench;
  const incoming = [...pool].sort((a, b) => slotValue(b, slot, balance) - slotValue(a, slot, balance) || a.id.localeCompare(b.id))[0];
  if (!incoming) return false;
  const outgoing = team.pitch[slotIndex];
  team.bench = team.bench.filter((p) => p !== incoming);
  const line = newLine(incoming, team.sheet.clubId, team.side, slot, false);
  state.lines.push(line);
  team.pitch[slotIndex] = makeOnPitch(incoming, slot, line, balance, state.ctx.date);
  team.subsUsed++;
  team.stats.subs++;
  team.windowMinutes.add(clockOf(state, state.step).minute);
  pushEvent(state, { type: 'sub', side: team.side, ...(outgoing ? { playerId: outgoing.player.id } : {}), otherPlayerId: incoming.id });
  return true;
}

function removeFromPitch(state: MatchState, team: TeamState, op: OnPitch): void {
  const idx = team.pitch.indexOf(op);
  if (idx < 0) return;
  team.pitch[idx] = null;
  if (team.sheet.slots[idx] !== 'GK') return;
  // Goalkeeper gone: bring the backup keeper on for an outfield player, or put an outfield player in goal.
  const benchGk = team.bench.find((p) => p.positions[0] === 'GK');
  const outfield = onPitch(team).filter((x) => x.slot !== 'GK');
  if (benchGk && canSubstitute(state, team) && outfield.length > 0) {
    const weakest = [...outfield].sort((a, b) => effectiveValue(a, team, state.ctx.balance) - effectiveValue(b, team, state.ctx.balance))[0] as OnPitch;
    const wIdx = team.pitch.indexOf(weakest);
    team.pitch[wIdx] = null;
    team.pitch[idx] = weakest; // temporarily, substitute() replaces it
    if (substitute(state, team, idx)) {
      weakest.line.conditionEnd = weakest.condition;
      return;
    }
    team.pitch[idx] = null;
    team.pitch[wIdx] = weakest;
  }
  const keeper = [...outfield].sort((a, b) => b.gk - a.gk)[0];
  if (keeper) {
    team.pitch[team.pitch.indexOf(keeper)] = null;
    team.pitch[idx] = makeOnPitch(keeper.player, 'GK', keeper.line, state.ctx.balance, state.ctx.date);
    (team.pitch[idx] as OnPitch).condition = keeper.condition;
  }
}

function sendOff(state: MatchState, team: TeamState, op: OnPitch, kind: 'secondYellow' | 'straight'): void {
  op.line.red = kind;
  op.line.conditionEnd = op.condition;
  team.stats.red++;
  pushEvent(state, { type: kind === 'secondYellow' ? 'secondYellow' : 'red', side: team.side, playerId: op.player.id });
  removeFromPitch(state, team, op);
}

function injure(state: MatchState, team: TeamState, op: OnPitch): void {
  const { balance, rng } = state.ctx;
  const kind = rng.weightedPick(balance.injuries.types, balance.injuries.types.map((t) => t.weight));
  const injury = { type: rng.pick(kind.names), daysLeft: rng.int(kind.minDays, kind.maxDays) };
  op.line.injury = injury;
  op.line.conditionEnd = op.condition;
  pushEvent(state, { type: 'injury', side: team.side, playerId: op.player.id, injury });
  const idx = team.pitch.indexOf(op);
  if (state.ctx.autopilot?.[team.side] !== false && substitute(state, team, idx)) return;
  removeFromPitch(state, team, op);
}

// ---------------------------------------------------------------- shots

type ShotKind = 'open' | 'header' | 'penalty';

function resolveShot(state: MatchState, att: TeamState, def: TeamState, kind: ShotKind, xgOverride?: number): void {
  const { balance, rng, level } = state.ctx;
  const m = balance.match;
  const ops = onPitch(att);
  if (ops.length === 0) return;

  let shooter: OnPitch | undefined;
  if (kind === 'penalty') {
    shooter = ops.find((o) => o.player.id === att.tactics.setPieceTakerId) ?? [...ops].sort((a, b) => b.shoot - a.shoot)[0];
  } else if (kind === 'header') {
    shooter = pickWeighted(rng, ops, (o) => m.shooting.headerByPosition[o.slot] * (o.header / 50));
  } else {
    shooter = pickWeighted(rng, ops, (o) => m.shooting.shooterByPosition[o.slot] * (o.shoot / 50));
  }
  if (!shooter) return;

  const ratio = att.bands.att / def.bands.def;
  let xg: number;
  if (xgOverride !== undefined) xg = xgOverride;
  else if (kind === 'header') {
    xg = rng.float(m.corners.headerXg[0], m.corners.headerXg[1]) * m.xg.scaleByLevel[`${level}`];
  } else {
    const bucket = rng.weightedPick(m.xg.buckets, m.xg.buckets.map((b) => b[0]));
    xg = rng.float(bucket[1], bucket[2]) * ratio ** m.xg.qualityExponent * m.tactics.style[att.tactics.style].xg * m.xg.scaleByLevel[`${level}`];
  }
  xg = clamp(xg, m.xg.min, kind === 'penalty' ? 0.95 : m.xg.max);

  const skill = (kind === 'header' ? shooter.header : shooter.shoot) * conditionFactor(shooter.condition, balance);
  const gk = def.bands.gk;
  const exponent = kind === 'penalty' ? m.finishing.penaltyExponent : m.finishing.exponent;
  const pGoal = clamp(xg * clamp((skill / Math.max(1, gk)) ** exponent, m.finishing.min, m.finishing.max), 0, 0.98);

  att.stats.shots++;
  att.stats.xg += xg;
  const keeper = goalkeeper(def);
  const others = ops.filter((o) => o !== shooter);

  if (rng.chance(pGoal)) {
    if (kind === 'penalty') att.stats.penaltiesScored++;
    att.stats.goals++;
    att.stats.shotsOnTarget++;
    shooter.line.goals++;
    if (keeper) keeper.line.conceded++;
    let assist: OnPitch | undefined;
    if (kind !== 'penalty' && rng.chance(m.shooting.assistChance)) {
      assist = pickWeighted(rng, others, (o) => m.shooting.assisterByPosition[o.slot] * ((o.player.attributes.passing + o.player.attributes.decisions) / 100));
      if (assist) assist.line.assists++;
    }
    if (rng.chance(m.shooting.errorPerGoal)) {
      const culprit = pickWeighted(rng, onPitch(def), (o) => (m.bands.byPosition[o.slot].def ?? 0) * (100 - o.player.attributes.decisions));
      if (culprit) culprit.line.errors++;
    }
    pushEvent(state, {
      type: kind === 'penalty' ? 'penaltyGoal' : 'goal',
      side: att.side,
      playerId: shooter.player.id,
      ...(assist ? { otherPlayerId: assist.player.id } : {}),
      xg,
    });
    return;
  }

  const onTarget = rng.chance(kind === 'penalty' ? 0.6 : m.onTargetIfNoGoal);
  if (onTarget) {
    att.stats.shotsOnTarget++;
    if (keeper) keeper.line.saves++;
  }
  if (kind === 'penalty') {
    pushEvent(state, { type: 'penaltyMiss', side: att.side, playerId: shooter.player.id, xg });
    return;
  }
  if (rng.chance(m.shooting.keyPassChance)) {
    const passer = pickWeighted(rng, others, (o) => m.shooting.assisterByPosition[o.slot]);
    if (passer) passer.line.keyPasses++;
  }
  if (xg >= 0.3) pushEvent(state, { type: 'bigChance', side: att.side, playerId: shooter.player.id, xg });
  if (rng.chance(m.corners.perMissedShot)) corner(state, att, def);
}

function corner(state: MatchState, att: TeamState, def: TeamState): void {
  att.stats.corners++;
  if (state.ctx.rng.chance(state.ctx.balance.match.corners.headerChance)) resolveShot(state, att, def, 'header');
}

// ---------------------------------------------------------------- assistant

function assistant(state: MatchState, team: TeamState): void {
  if (state.ctx.autopilot?.[team.side] === false) return;
  const { balance } = state.ctx;
  const subs = balance.match.subs;
  const a = balance.match.assistant;
  const { minute } = clockOf(state, state.step);
  const isSecondHalf = state.step > balance.match.halfMinutes + state.addedFirst;

  // Mentality by score.
  const diff = score(state, team);
  let wanted: Mentality = team.baseMentality;
  if (isSecondHalf && diff < 0 && minute >= a.chaseIfLosingFromMinute) wanted = 'attacking';
  else if (isSecondHalf && diff > 0 && minute >= a.protectIfLeadingFromMinute) wanted = 'defensive';
  if (wanted !== team.tactics.mentality) {
    team.tactics.mentality = wanted;
    pushEvent(state, { type: 'mentality', side: team.side, mentality: wanted });
  }

  // Tired players at the substitution windows (only once per window minute, not in added time).
  if (!isSecondHalf || clockOf(state, state.step).added !== undefined || !subs.windowMinutes.includes(minute)) return;
  const tired = onPitch(team)
    .filter((o) => o.condition < subs.conditionThreshold && o.slot !== 'GK')
    .sort((x, y) => x.condition - y.condition)
    .slice(0, subs.perWindow);
  for (const op of tired) {
    const idx = team.pitch.indexOf(op);
    op.line.conditionEnd = op.condition;
    if (!substitute(state, team, idx)) break;
  }
}

// ---------------------------------------------------------------- minute

/** Simulates one minute. Returns the events of that minute. */
export function stepMinute(state: MatchState): MatchEvent[] {
  if (state.finished) return [];
  state.step++;
  const before = state.events.length;
  const { balance, rng, level } = state.ctx;
  const m = balance.match;
  const t = m.tactics;

  // Everyone on the pitch at the start of the minute has played it.
  for (const team of [state.home, state.away]) for (const o of onPitch(team)) o.line.minutesPlayed++;
  recomputeBands(state, state.home);
  recomputeBands(state, state.away);

  // Possession.
  const weight = (team: TeamState) =>
    team.bands.mid ** m.possessionExponent * t.style[team.tactics.style].possession * t.pressing[team.tactics.pressing].possession;
  const wHome = weight(state.home);
  const wAway = weight(state.away);
  const att = rng.chance(wHome / (wHome + wAway)) ? state.home : state.away;
  const def = other(state, att);
  att.possessionSteps++;

  // Chance.
  let pChance =
    m.chancePerMinuteByLevel[`${level}`] *
    (att.bands.att / def.bands.def) ** m.chanceExponent *
    t.mentality[att.tactics.mentality].own *
    t.mentality[def.tactics.mentality].opp *
    t.style[att.tactics.style].chance;
  if (att.tactics.style === 'counter' && def.tactics.mentality === 'attacking') pChance *= t.counterVsAttackingBonus;
  pChance = Math.min(m.maxChancePerMinute, pChance);
  if (rng.chance(pChance)) resolveShot(state, att, def, 'open');
  else if (rng.chance(m.corners.perPossessionMinute)) corner(state, att, def);

  // Foul by the defending team.
  if (rng.chance(m.fouls.perMinute * t.pressing[def.tactics.pressing].fouls)) {
    const fouler = pickWeighted(rng, onPitch(def), (o) => m.shooting.foulerByPosition[o.slot]);
    if (fouler) {
      def.stats.fouls++;
      if (rng.chance(m.fouls.redPerFoul)) sendOff(state, def, fouler, 'straight');
      else if (rng.chance(m.fouls.yellowPerFoul * (fouler.line.yellow > 0 ? m.fouls.secondYellowFactor : 1))) {
        fouler.line.yellow++;
        def.stats.yellow++;
        if (fouler.line.yellow >= 2) sendOff(state, def, fouler, 'secondYellow');
        else pushEvent(state, { type: 'yellow', side: def.side, playerId: fouler.player.id });
      }
      if (rng.chance(Math.min(0.1, m.fouls.penaltyPerFoul * (att.bands.att / def.bands.def)))) {
        att.stats.penalties++;
        resolveShot(state, att, def, 'penalty', m.fouls.penaltyXg);
      }
    }
  }

  // Injuries, condition and minutes for both teams.
  const inj = balance.injuries;
  for (const team of [state.home, state.away]) {
    const ops = onPitch(team);
    const hazards = ops.map(
      (o) => inj.hazardPerPlayerMinute * o.injuryRisk * (o.player.hidden.injuryProneness / 50) * (1 + (inj.fatigueEffect * (100 - o.condition)) / 100),
    );
    const total = hazards.reduce((s, h) => s + h, 0);
    if (total > 0 && rng.chance(total)) injure(state, team, rng.weightedPick(ops, hazards));

    const drainBase = balance.condition.drainPerMinute * t.pressing[team.tactics.pressing].drain;
    for (const o of onPitch(team)) {
      o.condition = Math.max(0, o.condition - drainBase * o.fatigue * (1.3 - (o.player.attributes.stamina / 100) * balance.condition.staminaEffect));
      o.line.conditionEnd = o.condition;
    }
    assistant(state, team);
  }

  if (state.step >= state.length) {
    if (needsDecision(state) && !state.extraTime) {
      state.extraTime = true;
      state.length += EXTRA_TIME_MINUTES;
    } else {
      if (needsDecision(state)) state.penalties = penaltyShootout(state);
      state.finished = true;
    }
  }
  return state.events.slice(before);
}

const EXTRA_TIME_MINUTES = 30;

/** Knockout still undecided (level score, or level aggregate in a second leg). */
function needsDecision(state: MatchState): boolean {
  const k = state.ctx.knockout;
  if (!k) return false;
  const home = state.home.stats.goals + (k.firstLeg?.home ?? 0);
  const away = state.away.stats.goals + (k.firstLeg?.away ?? 0);
  return home === away;
}

/** Penalty shoot-out: 5 kicks each, then sudden death. Takers by set pieces + finishing. */
function penaltyShootout(state: MatchState): [number, number] {
  const { rng } = state.ctx;
  const takers = (team: TeamState) => {
    const ops = onPitch(team);
    const sorted = [...ops].sort(
      (a, b) =>
        b.player.attributes.setPieces + b.player.attributes.finishing - (a.player.attributes.setPieces + a.player.attributes.finishing) ||
        a.player.id.localeCompare(b.player.id),
    );
    return sorted.length > 0 ? sorted : [];
  };
  const kick = (team: TeamState, opp: TeamState, i: number): boolean => {
    const list = takers(team);
    const taker = list[i % Math.max(1, list.length)];
    if (!taker) return false;
    const skill = 0.5 * taker.player.attributes.setPieces + 0.5 * taker.player.attributes.finishing;
    const p = Math.min(0.9, Math.max(0.55, 0.75 + (skill - opp.bands.gk) / 200));
    return rng.chance(p);
  };
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(state.home, state.away, i)) h++;
    if (h > a + (5 - i)) break;
    if (kick(state.away, state.home, i)) a++;
    if (a > h + (4 - i) || h > a + (4 - i)) break;
  }
  for (let i = 5; h === a && i < 40; i++) {
    if (kick(state.home, state.away, i)) h++;
    if (kick(state.away, state.home, i)) a++;
  }
  if (h === a) h++; // practically unreachable; keeps the result decided
  return [h, a];
}

/** Final report with ratings. The match must be finished. */
export function finishMatch(state: MatchState): MatchReport {
  if (!state.finished) throw new Error('Zápas ještě neskončil');
  const total = state.home.possessionSteps + state.away.possessionSteps || 1;
  state.home.stats.possession = Math.round((100 * state.home.possessionSteps) / total);
  state.away.stats.possession = 100 - state.home.stats.possession;
  for (const team of [state.home, state.away]) for (const op of onPitch(team)) op.line.conditionEnd = op.condition;

  const report: MatchReport = {
    homeId: state.home.sheet.clubId,
    awayId: state.away.sheet.clubId,
    level: state.ctx.level,
    homeGoals: state.home.stats.goals,
    awayGoals: state.away.stats.goals,
    events: state.events,
    stats: { home: state.home.stats, away: state.away.stats },
    players: state.lines,
    manOfTheMatchId: null,
    explanation: [],
    length: state.length,
    ...(state.extraTime ? { extraTime: true } : {}),
    ...(state.penalties ? { penalties: state.penalties } : {}),
  };
  const players = new Map<string, Player>();
  for (const team of [state.home, state.away]) {
    for (const p of team.sheet.lineup) if (p) players.set(p.id, p);
    for (const p of team.sheet.bench) players.set(p.id, p);
  }
  report.manOfTheMatchId = computeRatings(report, players, state.ctx.balance, state.ctx.rng.fork('ratings'));
  report.explanation = explainMatch(report);
  return report;
}

/** Quick mode: the whole match at once, the assistant decides for both teams. */
export function playMatch(home: TeamSheet, away: TeamSheet, ctx: MatchContext): MatchReport {
  const state = createMatch(home, away, ctx);
  while (!state.finished) stepMinute(state);
  return finishMatch(state);
}
