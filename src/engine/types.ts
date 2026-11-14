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

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD). Age is computed relative to 1 July of the season. */
  birthDate: string;
  /** 1–3 natural positions; the first one is the main position. */
  positions: Position[];
  /** Technical ability 1–100. */
  ts: number;
  /** Physical ability 1–100. */
  fs: number;
  /** Hidden potential 1–100 (POT = PA). */
  pot: number;
  clubId: string;
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
