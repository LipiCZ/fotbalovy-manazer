// Loading and validation of game data (data/*.json).
// `validateGameData` is pure (takes raw JSON, returns typed data or throws) so it can be tested
// with broken fixtures. `loadDefaultData` wires in the bundled JSON files.

import clubsJson from '../../data/clubs.json';
import competitionsJson from '../../data/competitions.json';
import regionsJson from '../../data/regions.json';
import namesJson from '../../data/names.json';
import balanceJson from '../../data/balance.json';
import {
  POSITIONS,
  type Club,
  type ClubSize,
  type Competition,
  type CompetitionId,
  type Level,
  type Position,
  type Region,
  type TiebreakCriterion,
} from './types.ts';

export type Tier = 'S' | 'R' | 'Y';

interface Gaussian {
  mean: number;
  sd: number;
  min: number;
  max: number;
}

export interface Balance {
  rating: { byPosition: Record<Position, { ts: number; fs: number }> };
  squad: {
    templateByLevel: Record<`${Level}`, Partial<Record<Position, Tier[]>>>;
    relatedPositions: Record<Position, Position[]>;
    secondPositionChance: number;
    thirdPositionChance: number;
  };
  strength: {
    starterMeanByLevel: Record<`${Level}`, number>;
    sizeOffset: Record<`${ClubSize}`, number>;
    reserveOffsetByParentSize: Record<`${ClubSize}`, number>;
    tiers: Record<Tier, { celOffset: number; celSd: number }>;
    minAttribute: number;
    maxAttribute: number;
  };
  age: { first: Record<Tier, Gaussian>; reserve: Record<Tier, Gaussian> };
  profile: { tsMinusCelSd: number; youthTechBiasPerYear: number; youthTechBiasUntilAge: number };
  potential: { gapByAge: [number, number][]; gapSd: number; max: number };
  simpleResults: {
    goalsByLevel: Record<`${Level}`, { home: number; away: number }>;
    strengthBonus: { maxBonus: number; celDiffForMaxBonus: number };
    teamStrengthTopN: number;
  };
}

export interface Names {
  firstNames: string[];
  lastNames: string[];
}

export interface GameData {
  regions: Region[];
  competitions: Competition[];
  clubs: Club[];
  names: Names;
  balance: Balance;
}

export interface RawGameData {
  regions: unknown;
  competitions: unknown;
  clubs: unknown;
  names: unknown;
  balance: unknown;
}

export class DataValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Neplatná herní data (${problems.length}):\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
    this.problems = problems;
  }
}

const COMPETITION_IDS: CompetitionId[] = ['chance-liga', 'cnl', 'cfl-a', 'cfl-b', 'msfl'];
const TIEBREAKERS: TiebreakCriterion[] = [
  'points',
  'h2hPoints',
  'h2hGoalDiff',
  'h2hGoalsFor',
  'goalDiff',
  'goalsFor',
  'wins',
  'lot',
];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function validateGameData(raw: RawGameData): GameData {
  const problems: string[] = [];

  // --- regions
  const regions: Region[] = [];
  if (!Array.isArray(raw.regions)) problems.push('regions: očekáváno pole');
  else
    raw.regions.forEach((r, i) => {
      if (!isObj(r) || !isStr(r.id) || !isStr(r.name)) problems.push(`regions[${i}]: chybí id nebo name`);
      else regions.push({ id: r.id, name: r.name });
    });
  const regionIds = new Set(regions.map((r) => r.id));

  // --- competitions
  const competitions: Competition[] = [];
  if (!Array.isArray(raw.competitions)) problems.push('competitions: očekáváno pole');
  else
    raw.competitions.forEach((c, i) => {
      const where = `competitions[${i}]`;
      if (!isObj(c)) return problems.push(`${where}: očekáván objekt`);
      if (!COMPETITION_IDS.includes(c.id as CompetitionId)) problems.push(`${where}: neznámé id "${String(c.id)}"`);
      if (!isStr(c.name) || !isStr(c.shortName)) problems.push(`${where}: chybí name/shortName`);
      if (c.level !== 1 && c.level !== 2 && c.level !== 3) problems.push(`${where}: level musí být 1–3`);
      if (!isInt(c.teamCount) || c.teamCount < 2) problems.push(`${where}: teamCount musí být celé číslo ≥ 2`);
      if (c.meetings !== 2) problems.push(`${where}: meetings zatím podporuje jen 2`);
      if (!isInt(c.pointsForWin) || !isInt(c.pointsForDraw)) problems.push(`${where}: body musí být celá čísla`);
      if (
        !Array.isArray(c.tiebreakers) ||
        c.tiebreakers[0] !== 'points' ||
        !c.tiebreakers.every((t) => TIEBREAKERS.includes(t as TiebreakCriterion))
      )
        problems.push(`${where}: tiebreakers musí začínat "points" a obsahovat jen známá kritéria`);
      competitions.push(c as unknown as Competition);
    });
  const compById = new Map(competitions.map((c) => [c.id, c]));
  if (compById.size !== competitions.length) problems.push('competitions: duplicitní id');

  // --- clubs: per-field checks
  const clubs: Club[] = [];
  if (!Array.isArray(raw.clubs)) problems.push('clubs: očekáváno pole');
  else
    raw.clubs.forEach((c, i) => {
      const where = `clubs[${i}]${isObj(c) && isStr(c.id) ? ` (${c.id})` : ''}`;
      if (!isObj(c)) return problems.push(`${where}: očekáván objekt`);
      if (!isStr(c.id) || !/^[a-z0-9-]+$/.test(c.id)) problems.push(`${where}: id musí být slug [a-z0-9-]`);
      for (const f of ['name', 'shortName', 'city'] as const)
        if (!isStr(c[f])) problems.push(`${where}: chybí ${f}`);
      if (!regionIds.has(c.regionId as string)) problems.push(`${where}: neznámý kraj "${String(c.regionId)}"`);
      if (!isInt(c.size) || c.size < 1 || c.size > 5) problems.push(`${where}: size musí být 1–5`);
      if (!compById.has(c.competitionId as CompetitionId))
        problems.push(`${where}: neznámá soutěž "${String(c.competitionId)}"`);
      if (c.parentClubId !== undefined && !isStr(c.parentClubId)) problems.push(`${where}: parentClubId musí být text`);
      if (typeof c.hasReserveTeam !== 'boolean') problems.push(`${where}: hasReserveTeam musí být true/false`);
      if (typeof c.verified !== 'boolean') problems.push(`${where}: verified musí být true/false`);
      for (const f of ['primaryColor', 'secondaryColor'] as const)
        if (typeof c[f] !== 'string' || !HEX_COLOR.test(c[f] as string))
          problems.push(`${where}: ${f} musí být barva ve tvaru #RRGGBB`);
      clubs.push(c as unknown as Club);
    });

  // --- clubs: cross-record checks
  const clubById = new Map<string, Club>();
  for (const c of clubs) {
    if (clubById.has(c.id)) problems.push(`clubs: duplicitní id "${c.id}"`);
    clubById.set(c.id, c);
  }
  for (const c of clubs) {
    if (c.parentClubId === undefined) continue;
    const parent = clubById.get(c.parentClubId);
    if (!parent) {
      problems.push(`${c.id}: parentClubId "${c.parentClubId}" neexistuje`);
      continue;
    }
    if (parent.parentClubId !== undefined)
      problems.push(`${c.id}: A-tým "${parent.id}" nesmí sám být B/C týmem`);
    if (!parent.hasReserveTeam) problems.push(`${c.id}: A-tým "${parent.id}" má hasReserveTeam = false`);
    if (c.hasReserveTeam) problems.push(`${c.id}: B/C tým nemůže mít vlastní B-tým`);
    const comp = compById.get(c.competitionId);
    const parentComp = compById.get(parent.competitionId);
    if (comp && parentComp) {
      if (comp.id === parentComp.id)
        problems.push(`${c.id}: B/C tým hraje stejnou soutěž (${comp.shortName}) jako jeho A-tým`);
      else if (comp.level <= parentComp.level)
        problems.push(`${c.id}: B/C tým nesmí hrát stejnou nebo vyšší úroveň než A-tým`);
      if (comp.level === 1) problems.push(`${c.id}: B/C tým nesmí hrát 1. ligu`);
    }
  }
  // No two teams of the same organisation in one competition (e.g. Slavia B and Slavia C).
  const orgInComp = new Map<string, string>();
  for (const c of clubs) {
    const key = `${c.parentClubId ?? c.id}@${c.competitionId}`;
    const other = orgInComp.get(key);
    if (other) problems.push(`${c.id}: ve stejné soutěži už hraje tým stejného klubu (${other})`);
    else orgInComp.set(key, c.id);
  }
  for (const comp of competitions) {
    const n = clubs.filter((c) => c.competitionId === comp.id).length;
    if (n !== comp.teamCount) problems.push(`${comp.id}: očekáváno ${comp.teamCount} týmů, v datech ${n}`);
  }

  // --- names
  let names: Names = { firstNames: [], lastNames: [] };
  if (
    !isObj(raw.names) ||
    !Array.isArray(raw.names.firstNames) ||
    !Array.isArray(raw.names.lastNames) ||
    raw.names.firstNames.length < 20 ||
    raw.names.lastNames.length < 50 ||
    ![...raw.names.firstNames, ...raw.names.lastNames].every(isStr)
  )
    problems.push('names: očekáváno firstNames (≥ 20) a lastNames (≥ 50) jako pole textů');
  else names = { firstNames: raw.names.firstNames as string[], lastNames: raw.names.lastNames as string[] };

  // --- balance (structural sanity; values are trusted)
  const balance = raw.balance as Balance;
  if (!isObj(raw.balance)) problems.push('balance: očekáván objekt');
  else {
    for (const key of ['rating', 'squad', 'strength', 'age', 'profile', 'potential', 'simpleResults'])
      if (!isObj(raw.balance[key])) problems.push(`balance.${key}: chybí`);
    if (problems.length === 0) {
      for (const p of POSITIONS) {
        const w = balance.rating.byPosition[p];
        if (!w || Math.abs(w.ts + w.fs - 1) > 1e-9) problems.push(`balance.rating.byPosition.${p}: váhy musí dát součet 1`);
      }
      for (const lvl of ['1', '2', '3'] as const) {
        const tpl = balance.squad.templateByLevel[lvl];
        const starters = tpl ? Object.values(tpl).flat().filter((t) => t === 'S').length : 0;
        if (starters !== 11) problems.push(`balance.squad.templateByLevel.${lvl}: musí mít právě 11 rolí "S" (má ${starters})`);
      }
    }
  }

  if (problems.length > 0) throw new DataValidationError(problems);
  return { regions, competitions, clubs, names, balance };
}

export function loadDefaultData(): GameData {
  return validateGameData({
    regions: regionsJson,
    competitions: competitionsJson,
    clubs: clubsJson,
    names: namesJson,
    balance: balanceJson,
  });
}
