// Loading and validation of game data (data/*.json).
// `validateGameData` is pure (takes raw JSON, returns typed data or throws) so it can be tested
// with broken fixtures. `loadDefaultData` wires in the bundled JSON files.

import clubsJson from '../../data/clubs.json';
import competitionsJson from '../../data/competitions.json';
import regionsJson from '../../data/regions.json';
import namesJson from '../../data/names.json';
import balanceJson from '../../data/balance.json';
import tacticsJson from '../../data/tactics.json';
import pyramidJson from '../../data/pyramid.json';
import { hashString } from './rng.ts';
import {
  GK_TECH,
  OUTFIELD_TECH,
  PHYSICAL,
  POSITIONS,
  type AttributeId,
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

interface HiddenCfg {
  mean: number;
  sd: number;
  perYearOver22: number;
}

export interface Balance {
  rating: { byPosition: Record<Position, { ts: number; fs: number }> };
  attributes: {
    weights: Record<Position, { tech: Partial<Record<AttributeId, number>>; phys: Partial<Record<AttributeId, number>> }>;
    generation: {
      relevantSd: number;
      irrelevantPenalty: number;
      irrelevantSd: number;
      gkOutfieldTechPenalty: number;
      outfieldGkTech: { min: number; max: number };
    };
    hidden: Record<'adaptation' | 'professionalism' | 'consistency' | 'injuryProneness', HiddenCfg>;
    leadership: HiddenCfg;
  };
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
  match: MatchBalance;
  condition: {
    drainPerMinute: number;
    staminaEffect: number;
    effect: number;
    recoveryPerDay: number;
    daysBetweenRounds: number;
  };
  form: { historyLength: number; window: number; neutral: number; effectPerPoint: number; maxEffect: number };
  injuries: {
    hazardPerPlayerMinute: number;
    fatigueEffect: number;
    severities: { weight: number; minDays: number; maxDays: number; types: string[] }[];
  };
  discipline: {
    yellowsPerBan: number;
    yellowAccumulationBan: number;
    secondYellowBan: number;
    straightRedBan: { matches: number[]; weights: number[] };
    resetYellowsAtSeasonEnd: boolean;
  };
  ratings: {
    base: number;
    goal: number;
    assist: number;
    keyPass: number;
    errorLeadingToGoal: number;
    redCard: number;
    gkSave: number;
    gkConceded: number;
    teamWin: number;
    teamLoss: number;
    performanceMean: number;
    performanceSkill: number;
    noiseSd: number;
    min: number;
    max: number;
  };
  ai: {
    counterIfSpeedAboveCel: number;
    possessionIfTsAboveFs: number;
    mentalityStrengthDiff: number;
    pressingStaminaDiff: number;
  };
  development: {
    annualByAge: [number, number][];
    minutes: {
      bench: number;
      shareExponent: number;
      levelOptimum: [number, number];
      levelTooWeakPerPoint: number;
      levelTooStrongPerPoint: number;
      levelMin: number;
    };
    formMultiplier: [number, number][];
    formMatches: number;
    professionalism: { min: number; max: number };
    potentialSoftness: number;
    confidence: { threshold: number; minApps: number };
    potentialRaise: { rating: number; minApps: number; min: number; max: number; cap: number };
    split: {
      youngTsShare: number;
      youngUntil: number;
      primeTsShare: number;
      declineTsShare: number;
      declineFrom: number;
      decisionsPerYearFrom30: number;
      leadershipPerYearFrom28: number;
    };
    attributeNoise: number;
    irrelevantShare: number;
    youth: { minutesMean: number; minutesSd: number; ratingMean: number; ratingSd: number };
    adaptation: { penalty: number; minMonths: number; maxMonths: number; untilAge: number };
    potentialDecay: { fromAge: number; share: number };
  };
  academy: {
    intakeMonths: number[];
    perIntake: [number, number];
    age: [number, number];
    celMeanByLevel: Record<`${Level}`, number>;
    celSizeOffset: Record<`${ClubSize}`, number>;
    celSd: number;
    potGap: { mean: number; sd: number };
    talentChance: number;
    talentBonus: [number, number];
    promoteFromAge: number;
    releaseAtAge: number;
    maxSize: number;
  };
  squads: {
    byLevel: Record<`${Level}`, { min: number; max: number }>;
    minGoalkeepers: number;
    promoteFromBMargin: number;
    maxSwapsPerWindow: number;
    freeAgents: { anchorGap: number; maxPerWindow: number };
    keepValue: { youthWeight: number; agePenalty: number };
    /** AI B-teams keep players younger than this (older ones not good enough for the A-team leave). */
    reserveMaxAge: number;
  };
  retirement: { byAge: [number, number][]; weakBonus: number; weakFromAge: number; weakCelBelowLeague: number };
  training: Record<TrainingIntensity, { growth: number; recovery: number; injuryPerPlayerDay: number }> & {
    assistant: { hardIfDaysToMatch: number; lightIfDaysToMatch: number };
    injuryDays: [number, number];
  };
  rotation: { minCondition: number };
}

export type TrainingIntensity = 'light' | 'normal' | 'hard';

export interface Pyramid {
  firstLeague: {
    id: CompetitionId;
    titleGroup: [number, number];
    placementPlayoff: [number, number];
    relegationGroup: [number, number];
    directRelegation: number;
    barrage: { pairs: [number, number][] };
  };
  secondLeague: { id: CompetitionId; directPromotion: number; size: number };
  thirdLevel: {
    promotionPerGroup: number;
    groups: Partial<Record<CompetitionId, { regions: string[] }>>;
    flexibleRegions: Record<string, CompetitionId[]>;
    targetSizes: Partial<Record<CompetitionId, number>>;
  };
  cup: { name: string; rounds: { name: string; date: string; neutral?: boolean }[]; lowerLevelAtHomeRounds: number };
}

export type Band = 'def' | 'mid' | 'att';
type ByPosition = Record<Position, number>;

export interface MatchBalance {
  halfMinutes: number;
  addedTime: { firstHalf: [number, number]; secondHalf: [number, number] };
  positionFit: { natural: number; related: number; foreign: number };
  bands: { byPosition: Record<Position, Partial<Record<Band, number>>>; referenceFormation: FormationId };
  styleMix: Record<Style, { ts: number; fs: number; speed: number }>;
  homeBonus: number;
  possessionExponent: number;
  chanceExponent: number;
  chancePerMinuteByLevel: Record<`${Level}`, number>;
  maxChancePerMinute: number;
  xg: {
    buckets: [number, number, number][];
    qualityExponent: number;
    scaleByLevel: Record<`${Level}`, number>;
    min: number;
    max: number;
  };
  finishing: { exponent: number; min: number; max: number; penaltyExponent: number };
  onTargetIfNoGoal: number;
  corners: { perMissedShot: number; perPossessionMinute: number; headerChance: number; headerXg: [number, number] };
  fouls: {
    perMinute: number;
    yellowPerFoul: number;
    /** Multiplier of yellowPerFoul for a player who already has a yellow card (booked players are careful). */
    secondYellowFactor: number;
    redPerFoul: number;
    penaltyPerFoul: number;
    penaltyXg: number;
  };
  tactics: {
    mentality: Record<Mentality, { own: number; opp: number }>;
    pressing: Record<Pressing, { possession: number; fouls: number; drain: number }>;
    style: Record<Style, { possession: number; chance: number; xg: number }>;
    counterVsAttackingBonus: number;
  };
  shooting: {
    shooterByPosition: ByPosition;
    headerByPosition: ByPosition;
    assisterByPosition: ByPosition;
    foulerByPosition: ByPosition;
    assistChance: number;
    keyPassChance: number;
    errorPerGoal: number;
  };
  subs: {
    max: number;
    windows: number;
    benchSize: number;
    windowMinutes: number[];
    perWindow: number;
    conditionThreshold: number;
  };
  assistant: { chaseIfLosingFromMinute: number; protectIfLeadingFromMinute: number };
}

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1';
export type Style = 'possession' | 'direct' | 'counter';
export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type Pressing = 'low' | 'medium' | 'high';

export interface Formation {
  id: FormationId;
  slots: Position[];
  help: string;
}

export interface TacticOption<T extends string> {
  id: T;
  name: string;
  help: string;
}

export interface TacticsData {
  formations: Formation[];
  styles: TacticOption<Style>[];
  mentalities: TacticOption<Mentality>[];
  pressing: TacticOption<Pressing>[];
}

export interface Names {
  firstNames: string[];
  lastNames: string[];
}

export interface GameData {
  /** Fingerprint of the raw data files; saves remember it to warn when the data changed. */
  hash: string;
  regions: Region[];
  competitions: Competition[];
  clubs: Club[];
  names: Names;
  balance: Balance;
  tactics: TacticsData;
  pyramid: Pyramid;
}

export interface RawGameData {
  regions: unknown;
  competitions: unknown;
  clubs: unknown;
  names: unknown;
  balance: unknown;
  tactics: unknown;
  pyramid: unknown;
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
      const cal = c.calendar as { firstRound?: unknown; winterBreak?: unknown } | undefined;
      const mmdd = (v: unknown) => typeof v === 'string' && /^\d{2}-\d{2}$/.test(v);
      if (!cal || !mmdd(cal.firstRound) || !Array.isArray(cal.winterBreak) || cal.winterBreak.length !== 2 || !cal.winterBreak.every(mmdd))
        problems.push(`${where}: calendar musí mít firstRound a winterBreak ve tvaru MM-DD`);
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
    for (const key of [
      'rating', 'attributes', 'squad', 'strength', 'age', 'profile', 'potential', 'simpleResults',
      'match', 'condition', 'form', 'injuries', 'discipline', 'ratings', 'ai',
      'development', 'academy', 'squads', 'retirement', 'training', 'rotation',
    ])
      if (!isObj(raw.balance[key])) problems.push(`balance.${key}: chybí`);
    if (problems.length === 0) {
      for (const p of POSITIONS) {
        const w = balance.rating.byPosition[p];
        if (!w || Math.abs(w.ts + w.fs - 1) > 1e-9) problems.push(`balance.rating.byPosition.${p}: váhy musí dát součet 1`);
        const aw = balance.attributes.weights[p];
        if (!aw) {
          problems.push(`balance.attributes.weights.${p}: chybí`);
          continue;
        }
        const allowedTech: readonly string[] = p === 'GK' ? GK_TECH : OUTFIELD_TECH;
        for (const [group, allowed] of [
          ['tech', allowedTech],
          ['phys', PHYSICAL as readonly string[]],
        ] as const) {
          const entries = Object.entries(aw[group]);
          const sum = entries.reduce((s, [, v]) => s + (v ?? 0), 0);
          if (Math.abs(sum - 1) > 1e-9) problems.push(`balance.attributes.weights.${p}.${group}: váhy musí dát součet 1 (je ${sum})`);
          for (const [k] of entries)
            if (!allowed.includes(k)) problems.push(`balance.attributes.weights.${p}.${group}: atribut "${k}" sem nepatří`);
        }
      }
      for (const lvl of ['1', '2', '3'] as const) {
        const tpl = balance.squad.templateByLevel[lvl];
        const starters = tpl ? Object.values(tpl).flat().filter((t) => t === 'S').length : 0;
        if (starters !== 11) problems.push(`balance.squad.templateByLevel.${lvl}: musí mít právě 11 rolí "S" (má ${starters})`);
      }
    }
  }

  // --- tactics
  const tactics = raw.tactics as TacticsData;
  if (!isObj(raw.tactics) || !Array.isArray(raw.tactics.formations)) problems.push('tactics: chybí formations');
  else {
    for (const f of tactics.formations) {
      const gks = f.slots.filter((p) => p === 'GK').length;
      if (f.slots.length !== 11 || gks !== 1) problems.push(`tactics.formations ${f.id}: musí mít 11 slotů a právě 1 brankáře`);
      if (!f.slots.every((p) => POSITIONS.includes(p))) problems.push(`tactics.formations ${f.id}: neznámá pozice`);
    }
    if (isObj(raw.balance) && problems.length === 0) {
      const ref = balance.match.bands.referenceFormation;
      if (!tactics.formations.some((f) => f.id === ref)) problems.push(`balance.match.bands.referenceFormation "${ref}" neexistuje`);
    }
  }

  // --- pyramid
  const pyramid = raw.pyramid as Pyramid;
  if (!isObj(raw.pyramid) || !isObj(raw.pyramid.firstLeague) || !isObj(raw.pyramid.thirdLevel) || !isObj(raw.pyramid.cup))
    problems.push('pyramid: chybí firstLeague, thirdLevel nebo cup');
  else if (problems.length === 0) {
    const ids = new Set(competitions.map((c) => c.id));
    if (!ids.has(pyramid.firstLeague.id) || !ids.has(pyramid.secondLeague.id)) problems.push('pyramid: neznámá soutěž 1. nebo 2. ligy');
    for (const g of Object.keys(pyramid.thirdLevel.groups)) if (!ids.has(g as CompetitionId)) problems.push(`pyramid.thirdLevel: neznámá skupina ${g}`);
    const regionsInGroups = new Set([...Object.values(pyramid.thirdLevel.groups).flatMap((g) => g?.regions ?? []), ...Object.keys(pyramid.thirdLevel.flexibleRegions)]);
    for (const r of regionIds) if (!regionsInGroups.has(r)) problems.push(`pyramid.thirdLevel: kraj ${r} nemá skupinu 3. ligy`);
    const [t0, t1] = pyramid.firstLeague.titleGroup;
    const [r0, r1] = pyramid.firstLeague.relegationGroup;
    const [p0, p1] = pyramid.firstLeague.placementPlayoff;
    if (t0 !== 1 || p0 !== t1 + 1 || r0 !== p1 + 1 || p1 - p0 !== 3) problems.push('pyramid.firstLeague: skupiny nadstavby musí navazovat (play-off má 4 týmy)');
    const firstSize = competitions.find((c) => c.id === pyramid.firstLeague.id)?.teamCount;
    if (r1 !== firstSize) problems.push('pyramid.firstLeague: skupina o záchranu musí končit posledním místem');
    if (pyramid.cup.rounds.length < 1) problems.push('pyramid.cup: žádná kola');
  }

  if (problems.length > 0) throw new DataValidationError(problems);
  const hash = hashString(JSON.stringify(raw)).toString(16).padStart(8, '0');
  return { hash, regions, competitions, clubs, names, balance, tactics, pyramid };
}

export function loadDefaultData(): GameData {
  return validateGameData({
    regions: regionsJson,
    competitions: competitionsJson,
    clubs: clubsJson,
    names: namesJson,
    balance: balanceJson,
    tactics: tacticsJson,
    pyramid: pyramidJson,
  });
}
