// Serializable game state (saved as-is). No Maps, no class instances.

import type { TrainingIntensity } from '../data.ts';
import type { Budget, ClubFinance, Transaction, TxType } from './finance.ts';
import type { Tactics } from '../lineup.ts';
import type { MatchReport, TeamMatchStats } from '../match/types.ts';
import type { CompetitionId, Fixture, MatchResult, Player, Position } from '../types.ts';

export const SAVE_VERSION = 4;

/** Compact per-match record kept for every match. */
export interface MatchSummary extends MatchResult {
  date: string;
  stats: { home: TeamMatchStats; away: TeamMatchStats };
  ratingSum: number;
  ratingCount: number;
  injuries: number;
  /** Goal scorers for result lists: [playerId, minute, side]. */
  scorers: [string, number, 'home' | 'away'][];
  extraTime?: boolean;
  /** Penalty shoot-out result [home, away]. */
  penalties?: [number, number];
  attendance?: number;
  capacity?: number;
}

/** Regular season of a league. */
export interface CompetitionProgress {
  id: CompetitionId;
  clubIds: string[];
  fixtures: Fixture[];
  /** roundDates[i] = date of round i + 1. */
  roundDates: string[];
  playedRounds: number;
  results: MatchSummary[];
}

/** A fixture with its own date (post-season, play-off, barrage). */
export interface DatedFixture extends Fixture {
  date: string;
  /** Knockout: extra time and penalties when level (for a two-legged tie: on aggregate in leg 2). */
  knockout?: boolean;
  /** Two-legged tie: index of the tie and the leg. */
  tie?: number;
  leg?: 1 | 2;
  neutral?: boolean;
}

export type StageId = 'title-group' | 'relegation-group' | 'placement-semi' | 'placement-final' | 'barrage';

export interface StageProgress {
  id: StageId;
  clubIds: string[];
  fixtures: DatedFixture[];
  results: MatchSummary[];
}

export interface CupTie {
  homeId: string;
  /** null = bye. */
  awayId: string | null;
  result?: MatchSummary;
  winnerId?: string;
}

export interface CupRound {
  name: string;
  date: string;
  neutral?: boolean;
  ties: CupTie[];
}

export interface CupState {
  rounds: CupRound[];
  /** Index of the next round to play (rounds.length when finished). */
  current: number;
  winnerId?: string;
}

/** The manager's chosen line-up; slots follow tactics.formation. */
export interface UserLineup {
  slots: Position[];
  playerIds: (string | null)[];
  benchIds: string[];
}

export interface UserMatch {
  date: string;
  /** "Chance Liga, 12. kolo", "MOL Cup, osmifinále", "Baráž, 2. zápas" … */
  label: string;
  report: MatchReport;
}

export type TrainingSetting = TrainingIntensity | 'assistant';

export interface UserTeamState {
  tactics: Tactics;
  lineup: UserLineup;
  /** Delegated to the assistant (design, section 3): formation and players picked before every match. */
  autoLineup: boolean;
  training: TrainingSetting;
  /** The user's matches this season (full reports). */
  matches: UserMatch[];
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

export type NewsKind = 'injury' | 'suspension' | 'lineup' | 'recovered' | 'academy' | 'development' | 'season' | 'info' | 'transfer' | 'contract' | 'scouting';

export interface NewsItem {
  date: string;
  kind: NewsKind;
  text: string;
  playerId?: string;
}

export interface Movement {
  clubId: string;
  from: CompetitionId | null;
  to: CompetitionId | null;
  /** 'promoted' | 'relegated' | 'barrage-won' | 'barrage-lost' | 'forced' (B-team) | 'regrouped' | 'removed' */
  reason: 'promoted' | 'relegated' | 'barrage' | 'forced' | 'regrouped' | 'removed';
}

/** Summary of a finished season (kept in history). */
export interface SeasonRecord {
  seasonYear: number;
  /** Final order of every competition. */
  standings: Partial<Record<CompetitionId, string[]>>;
  cupWinnerId: string | null;
  movements: Movement[];
  userClubId: string | null;
  userCompetitionId: CompetitionId | null;
  userPosition: number | null;
  /** Board evaluation of the manager's season (design, sections 10 and 14). */
  evaluation?: SeasonEvaluation;
  /** The manager's club: season totals by category and cash at the end. */
  finance?: { season: Partial<Record<TxType, number>>; cashEnd: number };
}

export type Grade = 'vynikající' | 'úspěšná' | 'přijatelná' | 'neúspěšná' | 'katastrofa';

export interface BoardGoals {
  /** Finish at this position or better. */
  leaguePosition: number;
  leagueLabel: string;
  /** Reach this cup round (index into cup.rounds) or further. */
  cupRound: number;
  cupLabel: string;
}

export interface SeasonEvaluation {
  league: Grade;
  cup: Grade;
  overall: Grade;
  leaguePosition: number;
  cupReached: number;
}

export interface BoardState {
  goals: BoardGoals;
  budget: Budget;
  /** Overall grades of past seasons (newest last) – for the sacking rule in phase 8. */
  grades: Grade[];
}

export type OfferStatus = 'open' | 'countered' | 'agreed' | 'pending' | 'done' | 'rejected' | 'withdrawn' | 'expired';

/** Transfer or loan offer (design, section 8). */
export interface Offer {
  id: string;
  kind: 'transfer' | 'loan';
  playerId: string;
  sellerId: string;
  buyerId: string;
  fee: number;
  /** Fee paid in 1–3 yearly installments. */
  installments: number;
  sellOnShare: number;
  loan?: { wageShare: number; until: string; optionFee?: number };
  status: OfferStatus;
  rounds: number;
  /** Seller's counter (fee). */
  counterFee?: number;
  initiatedBy: 'user' | 'ai';
  createdAt: string;
  expiresAt: string;
  /** Personal terms agreed with the player. */
  terms?: { wage: number; years: number; signingBonus: number };
  /** AI buyer: the most it will pay (hidden from the manager). */
  limit?: number;
  note?: string;
}

/** Money due later (transfer installments). */
export interface Installment {
  date: string;
  fromClubId: string;
  toClubId: string;
  amount: number;
  note: string;
}

export interface MarketState {
  offers: Offer[];
  installments: Installment[];
  nextId: number;
  /** Purchases per club in the current window. */
  windowBuys: Record<string, number>;
}

export type ScoutLevel = 'začátečník' | 'zkušený' | 'elitní';

export interface Scout {
  id: string;
  name: string;
  level: ScoutLevel;
  salary: number;
  /** Region (youth) or competition (adults) or a player. */
  task: { kind: 'region'; regionId: string } | { kind: 'competition'; competitionId: CompetitionId; focus: 'talents' | 'bargains' } | { kind: 'player'; playerId: string } | null;
}

/** What the manager's club knows about a player (design, section 6). */
export interface Knowledge {
  celGuess: number;
  potGuess: number;
  /** Current accuracy ±. */
  accuracy: number;
  observations: number;
  updated: string;
}

export interface ScoutTip {
  id: string;
  date: string;
  regionId: string;
  scoutId: string;
  player: Player;
  cost: number;
}

export interface ScoutingState {
  scouts: Scout[];
  candidates: Scout[];
  knowledge: Record<string, Knowledge>;
  tips: ScoutTip[];
  nextId: number;
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
  /** Club -> competition this season. Clubs outside the simulated pyramid (removed B-teams) are absent. */
  membership: Record<string, CompetitionId>;
  /** All players including academies. */
  players: Player[];
  competitions: CompetitionProgress[];
  stages: StageProgress[];
  cup: CupState | null;
  user: UserTeamState | null;
  playerStats: Record<string, PlayerSeasonStats>;
  news: NewsItem[];
  history: SeasonRecord[];
  /** The whole season including post-season, barrage and cup is over. */
  finished: boolean;
  finances: Record<string, ClubFinance>;
  /** Transactions of the manager's club this season. */
  transactions: Transaction[];
  board: BoardState | null;
  market: MarketState;
  scouting: ScoutingState;
}

export function emptyStats(): PlayerSeasonStats {
  return { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, ratingSum: 0, motm: 0 };
}
