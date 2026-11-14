// Core data types of the game engine. Identifiers are English, data values Czech.

export type CompetitionId = 'chance-liga' | 'cnl' | 'cfl-a' | 'cfl-b' | 'msfl';
export type Level = 1 | 2 | 3;
export type ClubSize = 1 | 2 | 3 | 4 | 5;

export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'] as const;
export type Position = (typeof POSITIONS)[number];

/** Czech position abbreviations for the UI. */
export const POSITION_LABEL_CS: Record<Position, string> = {
  GK: 'BR',
  CB: 'SO',
  LB: 'LO',
  RB: 'PO',
  DM: 'DZ',
  CM: 'SZ',
  AM: 'OZ',
  LM: 'LZ',
  RM: 'PZ',
  LW: 'LK',
  RW: 'PK',
  ST: 'ÚT',
};

export type TiebreakCriterion =
  | 'points'
  | 'h2hPoints'
  | 'h2hGoalDiff'
  | 'h2hGoalsFor'
  | 'goalDiff'
  | 'goalsFor'
  | 'wins'
  | 'lot';

export interface Region {
  id: string;
  name: string;
}

export interface Competition {
  id: CompetitionId;
  name: string;
  shortName: string;
  level: Level;
  /** Groups on the same level (ČFL A, ČFL B, MSFL) share a level. */
  teamCount: number;
  /** Number of times each pair meets in the regular season (2 = home and away). */
  meetings: 2;
  pointsForWin: number;
  pointsForDraw: number;
  tiebreakers: TiebreakCriterion[];
}

export interface Club {
  /** Slug, e.g. 'slavia-praha', 'slavia-praha-b'. */
  id: string;
  name: string;
  shortName: string;
  city: string;
  regionId: string;
  /** Game estimate of the club's size (budget, fan base, infrastructure). */
  size: ClubSize;
  competitionId: CompetitionId;
  /** Set for B/C teams: id of the A-team. */
  parentClubId?: string;
  /** Club runs a B-team (it may play in a lower, non-simulated league). */
  hasReserveTeam: boolean;
  /** Hex colours, e.g. '#E30613'. */
  primaryColor: string;
  secondaryColor: string;
  /** Data checked against a primary source (FAČR). */
  verified: boolean;
  /** Free-text note on uncertain data. */
  note?: string;
}

// --- Player attributes (design, section 11) ---

/** TS group of outfield players. */
export const OUTFIELD_TECH = [
  'finishing',
  'passing',
  'technique',
  'crossing',
  'heading',
  'tackling',
  'setPieces',
  'positioning',
  'decisions',
] as const;
/** TS group of goalkeepers. */
export const GK_TECH = ['reflexes', 'handling', 'oneOnOne', 'gkPositioning', 'distribution'] as const;
/** FS group (all players). */
export const PHYSICAL = ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping'] as const;
export const ATTRIBUTES = [...OUTFIELD_TECH, ...GK_TECH, ...PHYSICAL] as const;

export type OutfieldTechAttribute = (typeof OUTFIELD_TECH)[number];
export type GkTechAttribute = (typeof GK_TECH)[number];
export type PhysicalAttribute = (typeof PHYSICAL)[number];
export type AttributeId = (typeof ATTRIBUTES)[number];
export type Attributes = Record<AttributeId, number>;

export const ATTRIBUTE_LABEL_CS: Record<AttributeId, string> = {
  finishing: 'zakončení',
  passing: 'přihrávka',
  technique: 'technika',
  crossing: 'centry',
  heading: 'hlavičky',
  tackling: 'obranné zákroky',
  setPieces: 'standardky',
  positioning: 'výběr místa',
  decisions: 'vize a rozhodování',
  reflexes: 'reflexy',
  handling: 'chytání',
  oneOnOne: 'výběhy a 1 na 1',
  gkPositioning: 'umístění',
  distribution: 'rozehrávka',
  pace: 'rychlost',
  acceleration: 'akcelerace',
  stamina: 'výdrž',
  strength: 'síla',
  agility: 'obratnost',
  jumping: 'výskok',
};

/** Hidden attributes 1–99 (potential is stored separately as `pot`). */
export interface HiddenAttributes {
  /** How quickly the player adapts to adult football (used from phase 4). */
  adaptation: number;
  /** Work ethic, affects development (used from phase 4). */
  professionalism: number;
  /** Stability of match performance. */
  consistency: number;
  /** Higher = more frequent injuries. */
  injuryProneness: number;
}

export interface Injury {
  /** Czech description, e.g. 'natažený sval'. */
  type: string;
  daysLeft: number;
}

/** Changing state of a player (design: forma, kondice; morálka a sebevědomí přijdou později). */
export interface PlayerState {
  /** Match fitness 0–100 %. */
  condition: number;
  /** Ratings of the last matches (newest last, at most balance.form.historyLength). */
  recentRatings: number[];
  injury?: Injury;
  /** League matches the player still has to sit out. */
  suspensionMatches: number;
  /** Yellow cards this season in the league (for accumulation bans). */
  yellowCards: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD). Age is computed relative to 1 July of the season. */
  birthDate: string;
  /** 1–3 natural positions; the first one is the main position. */
  positions: Position[];
  /** Detailed attributes 1–99. TS, FS and CEL are computed from them (players/attributes.ts). */
  attributes: Attributes;
  /** Only used for choosing the captain. */
  leadership: number;
  hidden: HiddenAttributes;
  /** Hidden potential 1–100 (POT = PA). */
  pot: number;
  clubId: string;
  state: PlayerState;
}

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
}

export interface MatchResult extends Fixture {
  homeGoals: number;
  awayGoals: number;
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}
