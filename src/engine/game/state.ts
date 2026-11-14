// Serializable game state (saved as-is). No Maps, no class instances.

import type { Tactics } from '../lineup.ts';
import type { MatchReport, TeamMatchStats } from '../match/types.ts';
import type { CompetitionId, Fixture, MatchResult, Player, Position } from '../types.ts';

export const SAVE_VERSION = 1;

/** Compact per-match record kept for every match. */
export interface MatchSummary extends MatchResult {
  date: string;
  stats: { home: TeamMatchStats; away: TeamMatchStats };
  ratingSum: number;
  ratingCount: number;
  injuries: number;
  /** Goal scorers for result lists: [playerId, minute, side]. */
  scorers: [string, number, 'home' | 'away'][];
}

export interface CompetitionProgress {
  id: CompetitionId;
  clubIds: string[];
  fixtures: Fixture[];
  /** roundDates[i] = date of round i + 1. */
  roundDates: string[];
  playedRounds: number;
  results: MatchSummary[];
}

/** The manager's chosen line-up; slots follow tactics.formation. */
export interface UserLineup {
  slots: Position[];
  playerIds: (string | null)[];
  benchIds: string[];
}

export interface UserTeamState {
  tactics: Tactics;
  lineup: UserLineup;
  /** Delegated to the assistant (design, section 3): formation and players picked before every match. */
  autoLineup: boolean;
  /** Full reports of the user's matches this season. */
  reports: MatchReport[];
}

export interface PlayerSeasonStats {
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  ratingSum: number;
  motm: number;
}

export type NewsKind = 'injury' | 'suspension' | 'lineup' | 'recovered' | 'info';

export interface NewsItem {
  date: string;
  kind: NewsKind;
  text: string;
  playerId?: string;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  seed: string;
  seasonYear: number;
  managerName: string;
  /** null = no human manager (simulation, calibration). */
  userClubId: string | null;
  /** Date of the last processed day (starts on 1 July). */
  date: string;
  players: Player[];
  competitions: CompetitionProgress[];
  user: UserTeamState | null;
  playerStats: Record<string, PlayerSeasonStats>;
  news: NewsItem[];
  finished: boolean;
}

export function emptyStats(): PlayerSeasonStats {
  return { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, ratingSum: 0, motm: 0 };
}
