// Season statistics of players and derived lists (top scorers, form).

import type { GameData } from '../data.ts';
import type { MatchReport } from '../match/types.ts';
import type { CompetitionId, Player } from '../types.ts';

import { emptyStats, type GameState, type PlayerSeasonStats } from './state.ts';

export function recordStats(stats: Record<string, PlayerSeasonStats>, report: MatchReport): void {
  for (const l of report.players) {
    if (l.minutesPlayed <= 0 && l.red === 'none') continue;
    const s = (stats[l.playerId] ??= emptyStats());
    s.apps++;
    if (l.started) s.starts++;
    s.minutes += l.minutesPlayed;
    s.goals += l.goals;
    s.assists += l.assists;
    s.yellow += l.red === 'secondYellow' ? 0 : l.yellow;
    if (l.red !== 'none') s.red++;
    s.ratingSum += l.rating;
    if (report.manOfTheMatchId === l.playerId) s.motm++;
  }
}

export function averageRating(s: PlayerSeasonStats | undefined): number | null {
  return s && s.apps > 0 ? s.ratingSum / s.apps : null;
}

/** Form = average of the last `window` ratings (null without matches). */
export function formOf(player: Player, data: GameData): number | null {
  const recent = player.state.recentRatings.slice(-data.balance.form.window);
  return recent.length === 0 ? null : recent.reduce((s, r) => s + r, 0) / recent.length;
}

export interface LeaderRow {
  playerId: string;
  clubId: string;
  stats: PlayerSeasonStats;
}

/** Players of a competition sorted by goals, then assists, then fewer minutes. */
export function topScorers(state: GameState, competitionId: CompetitionId, limit = 20): LeaderRow[] {
  const comp = state.competitions.find((c) => c.id === competitionId);
  if (!comp) return [];
  const clubs = new Set(comp.clubIds);
  return state.players
    .filter((p) => clubs.has(p.clubId) && (state.playerStats[p.id]?.goals ?? 0) + (state.playerStats[p.id]?.assists ?? 0) > 0)
    .map((p) => ({ playerId: p.id, clubId: p.clubId, stats: state.playerStats[p.id] as PlayerSeasonStats }))
    .sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists || a.stats.minutes - b.stats.minutes || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

/** Best average rating with a minimum number of matches. */
export function bestRated(state: GameState, competitionId: CompetitionId, minApps: number, limit = 10): LeaderRow[] {
  const comp = state.competitions.find((c) => c.id === competitionId);
  if (!comp) return [];
  const clubs = new Set(comp.clubIds);
  return state.players
    .filter((p) => clubs.has(p.clubId) && (state.playerStats[p.id]?.apps ?? 0) >= minApps)
    .map((p) => ({ playerId: p.id, clubId: p.clubId, stats: state.playerStats[p.id] as PlayerSeasonStats }))
    .sort((a, b) => (averageRating(b.stats) ?? 0) - (averageRating(a.stats) ?? 0) || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}
