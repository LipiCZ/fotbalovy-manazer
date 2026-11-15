// Generator of fictional players and squads. Squad strength follows the competition level and
// club size (balance.json -> strength), reserve (B/C) teams are much younger.

import type { Balance, GameData, Tier } from '../data.ts';
import type { Rng } from '../rng.ts';
import {
  ATTRIBUTES,
  GK_TECH,
  OUTFIELD_TECH,
  PHYSICAL,
  type AttributeId,
  type Attributes,
  type Club,
  type HiddenAttributes,
  type Level,
  type Player,
  type Position,
} from '../types.ts';
import { celAt } from './rating.ts';

export interface GeneratedPlayer extends Player {
  /** Squad role the player was generated for (not persisted game state, useful for checks). */
  role: Tier;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function interpolate(points: [number, number][], x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    const [x0, y0] = points[i - 1] as [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Random birth date such that the player is exactly `age` on 1 July of seasonYear. */
export function birthDateForAge(age: number, seasonYear: number, rng: Rng): string {
  // Born between 2 July (seasonYear - age - 1) and 1 July (seasonYear - age).
  const start = Date.UTC(seasonYear - age - 1, 6, 2);
  const end = Date.UTC(seasonYear - age, 6, 1);
  const day = rng.int(0, Math.round((end - start) / 86_400_000));
  return new Date(start + day * 86_400_000).toISOString().slice(0, 10);
}

/** Target mean CEL of the starting XI for a club. */
export function starterMean(club: Club, level: Level, clubsById: Map<string, Club>, balance: Balance): number {
  const s = balance.strength;
  const base = s.starterMeanByLevel[`${level}`];
  if (club.parentClubId) {
    const parent = clubsById.get(club.parentClubId);
    return base + (parent ? s.reserveOffsetByParentSize[`${parent.size}`] : 0);
  }
  return base + s.sizeOffset[`${club.size}`];
}

export function pickPositions(main: Position, balance: Balance, rng: Rng): Position[] {
  const positions: Position[] = [main];
  const pool = rng.shuffle(balance.squad.relatedPositions[main]);
  if (pool.length > 0 && rng.chance(balance.squad.secondPositionChance)) {
    positions.push(pool[0] as Position);
    if (pool.length > 1 && rng.chance(balance.squad.thirdPositionChance)) positions.push(pool[1] as Position);
  }
  return positions;
}

/**
 * Detailed attributes whose weighted averages hit the TS/FS targets for the main position.
 * Attributes the position uses get target + noise, the others are lower; the used ones are then
 * shifted so that the weighted TS/FS match the targets (up to rounding and clamping).
 */
export function generateAttributes(
  main: Position,
  tsTarget: number,
  fsTarget: number,
  balance: Balance,
  rng: Rng,
): Attributes {
  const g = balance.attributes.generation;
  const { minAttribute: lo, maxAttribute: hi } = balance.strength;
  const weights = balance.attributes.weights[main];
  const isGk = main === 'GK';
  const raw = {} as Record<AttributeId, number>;

  const fill = (group: readonly AttributeId[], target: number, groupWeights: Partial<Record<AttributeId, number>>) => {
    const used = group.filter((a) => (groupWeights[a] ?? 0) > 0);
    for (const a of group) {
      raw[a] = used.includes(a) ? target + rng.normal(0, g.relevantSd) : target - g.irrelevantPenalty + rng.normal(0, g.irrelevantSd);
    }
    // Shift used attributes so that the weighted average equals the target.
    for (let iter = 0; iter < 3; iter++) {
      let current = 0;
      for (const a of used) current += (groupWeights[a] as number) * clamp(Math.round(raw[a]), lo, hi);
      const diff = target - current;
      if (Math.abs(diff) < 0.5) break;
      for (const a of used) raw[a] += diff;
    }
  };

  if (isGk) {
    fill(GK_TECH, tsTarget, weights.tech);
    for (const a of OUTFIELD_TECH) raw[a] = tsTarget - g.gkOutfieldTechPenalty + rng.normal(0, g.irrelevantSd);
  } else {
    fill(OUTFIELD_TECH, tsTarget, weights.tech);
    for (const a of GK_TECH) raw[a] = rng.int(g.outfieldGkTech.min, g.outfieldGkTech.max);
  }
  fill(PHYSICAL, fsTarget, weights.phys);

  const attributes = {} as Attributes;
  for (const a of ATTRIBUTES) attributes[a] = clamp(Math.round(raw[a]), lo, hi);
  return attributes;
}

function hiddenValue(
  cfg: { mean: number; sd: number; perYearOver22: number },
  age: number,
  rng: Rng,
  lo: number,
  hi: number,
): number {
  return clamp(Math.round(rng.normal(cfg.mean + Math.max(0, age - 22) * cfg.perYearOver22, cfg.sd)), lo, hi);
}

export function generateHidden(age: number, balance: Balance, rng: Rng): HiddenAttributes {
  const h = balance.attributes.hidden;
  const { minAttribute: lo, maxAttribute: hi } = balance.strength;
  return {
    adaptation: hiddenValue(h.adaptation, age, rng, lo, hi),
    professionalism: hiddenValue(h.professionalism, age, rng, lo, hi),
    consistency: hiddenValue(h.consistency, age, rng, lo, hi),
    injuryProneness: hiddenValue(h.injuryProneness, age, rng, lo, hi),
  };
}

export interface PlayerSpec {
  clubId: string;
  main: Position;
  role: Tier;
  targetMean: number;
  reserve: boolean;
}

export function generatePlayer(
  spec: PlayerSpec,
  id: string,
  seasonYear: number,
  data: Pick<GameData, 'balance' | 'names'>,
  rng: Rng,
): GeneratedPlayer {
  const { balance, names } = data;
  const { minAttribute: lo, maxAttribute: hi } = balance.strength;

  const ageCfg = (spec.reserve ? balance.age.reserve : balance.age.first)[spec.role];
  const age = clamp(Math.round(rng.normal(ageCfg.mean, ageCfg.sd)), ageCfg.min, ageCfg.max);

  const tier = balance.strength.tiers[spec.role];
  const cel = clamp(rng.normal(spec.targetMean + tier.celOffset, tier.celSd), lo, hi);

  // Split CEL into TS/FS so that w.ts*ts + w.fs*fs == cel. Young players are less physically mature.
  const w = balance.rating.byPosition[spec.main];
  const p = balance.profile;
  const youthBias = Math.max(0, p.youthTechBiasUntilAge - age) * p.youthTechBiasPerYear;
  const delta = rng.normal(youthBias, p.tsMinusCelSd);
  const tsTarget = clamp(cel + delta, lo, hi);
  const fsTarget = clamp((cel - w.ts * tsTarget) / w.fs, lo, hi);
  const attributes = generateAttributes(spec.main, tsTarget, fsTarget, balance, rng);
  const realCel = celAt({ attributes }, spec.main, balance);

  const gapMean = interpolate(balance.potential.gapByAge, age);
  const gap = Math.max(0, rng.normal(gapMean, balance.potential.gapSd));
  const pot = Math.max(Math.round(realCel), Math.min(balance.potential.max, Math.round(realCel + gap)));

  return {
    id,
    firstName: rng.pick(names.firstNames),
    lastName: rng.pick(names.lastNames),
    birthDate: birthDateForAge(age, seasonYear, rng),
    positions: pickPositions(spec.main, balance, rng),
    attributes,
    leadership: hiddenValue(balance.attributes.leadership, age, rng, lo, hi),
    hidden: generateHidden(age, balance, rng),
    pot,
    clubId: spec.clubId,
    state: { condition: 100, recentRatings: [], suspensionMatches: 0, yellowCards: 0 },
    role: spec.role,
  };
}

/** Generates squads for all clubs. Deterministic for a given rng seed. */
export function generateAllPlayers(data: GameData, seasonYear: number, rng: Rng): GeneratedPlayer[] {
  const clubsById = new Map(data.clubs.map((c) => [c.id, c]));
  const compById = new Map(data.competitions.map((c) => [c.id, c]));
  const players: GeneratedPlayer[] = [];
  let counter = 0;

  for (const club of data.clubs) {
    const comp = compById.get(club.competitionId);
    if (!comp) throw new Error(`Klub ${club.id}: neznámá soutěž ${club.competitionId}`);
    const clubRng = rng.fork(`club:${club.id}`);
    const targetMean = starterMean(club, comp.level, clubsById, data.balance);
    const template = data.balance.squad.templateByLevel[`${comp.level}`];

    for (const [main, roles] of Object.entries(template) as [Position, Tier[]][]) {
      for (const role of roles) {
        counter++;
        const id = `p${String(counter).padStart(5, '0')}`;
        players.push(
          generatePlayer(
            { clubId: club.id, main, role, targetMean, reserve: club.parentClubId !== undefined },
            id,
            seasonYear,
            data,
            clubRng,
          ),
        );
      }
    }
  }
  return players;
}
