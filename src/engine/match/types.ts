import type { Injury, Level, Position } from '../types.ts';
import type { Mentality } from '../data.ts';

export type Side = 'home' | 'away';

export type MatchEventType =
  | 'goal'
  | 'penaltyGoal'
  | 'penaltyMiss'
  | 'bigChance'
  | 'yellow'
  | 'secondYellow'
  | 'red'
  | 'injury'
  | 'sub'
  | 'mentality';

export interface MatchEvent {
  /** Match minute (1–90); in added time the base minute (45 or 90) plus `added`. */
  minute: number;
  added?: number;
  type: MatchEventType;
  side: Side;
  playerId?: string;
  /** Assist for goals, player coming on for substitutions. */
  otherPlayerId?: string;
  xg?: number;
  injury?: Injury;
  mentality?: Mentality;
}

export interface TeamMatchStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  /** Ball possession in % (0–100). */
  possession: number;
  fouls: number;
  yellow: number;
  red: number;
  corners: number;
  penalties: number;
  subs: number;
}

export type RedCardKind = 'none' | 'secondYellow' | 'straight';

export interface PlayerMatchLine {
  playerId: string;
  clubId: string;
  side: Side;
  /** Slot when the player started or came on. */
  slot: Position;
  started: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  keyPasses: number;
  saves: number;
  conceded: number;
  errors: number;
  yellow: number;
  red: RedCardKind;
  injury?: Injury;
  conditionEnd: number;
  rating: number;
}

export interface MatchReport {
  homeId: string;
  awayId: string;
  level: Level;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  stats: Record<Side, TeamMatchStats>;
  players: PlayerMatchLine[];
  manOfTheMatchId: string | null;
  /** 2–3 sentences from the assistant (Czech). */
  explanation: string[];
  /** Length of the match in minutes including added time. */
  length: number;
}
