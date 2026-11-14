// Generator of fictional players and squads. Squad strength follows the competition level and
// club size (balance.json -> strength), reserve (B/C) teams are much younger.

import type { Balance, GameData, Tier } from '../data.ts';
import type { Rng } from '../rng.ts';
import type { Club, Level, Player, Position } from '../types.ts';

export interface GeneratedPlayer extends Player {
  /** Squad role the player was generated for (not persisted game state, useful for checks). */
  role: Tier;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function interpolate(points: [number, number][], x: number): number {
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
function birthDateForAge(age: number, seasonYear: number, rng: Rng): string {
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

function pickPositions(main: Position, balance: Balance, rng: Rng): Position[] {
  const positions: Position[] = [main];
  const pool = rng.shuffle(balance.squad.relatedPositions[main]);
  if (pool.length > 0 && rng.chance(balance.squad.secondPositionChance)) {
    positions.push(pool[0] as Position);
    if (pool.length > 1 && rng.chance(balance.squad.thirdPositionChance)) positions.push(pool[1] as Position);
  }
  return positions;
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
  const ts = clamp(Math.round(cel + delta), lo, hi);
  const fs = clamp(Math.round((cel - w.ts * ts) / w.fs), lo, hi);
  const realCel = w.ts * ts + w.fs * fs;

  const gapMean = interpolate(balance.potential.gapByAge, age);
  const gap = Math.max(0, rng.normal(gapMean, balance.potential.gapSd));
  const pot = Math.max(Math.round(realCel), Math.min(balance.potential.max, Math.round(realCel + gap)));

  return {
    id,
    firstName: rng.pick(names.firstNames),
    lastName: rng.pick(names.lastNames),
    birthDate: birthDateForAge(age, seasonYear, rng),
    positions: pickPositions(spec.main, balance, rng),
    ts,
    fs,
    pot,
    clubId: spec.clubId,
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
