// Board goals and season evaluation (design, sections 10, 13, 14; addition inspired by CSM):
// every goal (league, cup) is graded in five steps; the cup is asymmetric (success helps a lot,
// failure does not hurt much). Sacking itself comes with the coach career (phase 8).

import type { GameData } from '../data.ts';
import type { ClubSize } from '../types.ts';
import { finalStandings, squadOf } from './advance.ts';
import { seasonBudget } from './finance.ts';
import { levelOfCompetition, membersOf } from './pyramid.ts';
import { selectionFor } from './selection.ts';
import type { BoardGoals, GameState, Grade, SeasonEvaluation } from './state.ts';

const GRADES: Grade[] = ['vynikající', 'úspěšná', 'přijatelná', 'neúspěšná', 'katastrofa'];

/** Goals for the manager's club at the start of a season. */
export function boardGoals(state: GameState, data: GameData): BoardGoals | null {
  const clubId = state.userClubId;
  const comp = clubId ? state.membership[clubId] : undefined;
  if (!clubId || !comp) return null;
  const club = data.clubs.find((c) => c.id === clubId);
  const level = levelOfCompetition(data, comp);
  const teams = membersOf(state.membership, comp);
  const strength = (id: string) => selectionFor(id, squadOf(state, id), data).strength;
  const rank = [...teams].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b)).indexOf(clubId) + 1;
  const n = teams.length;
  // The favourites are expected to finish near the top, the others a little below their squad rank.
  // An investor wants results one place better (phase 7, design section 13).
  const tighter = state.club?.investor ? data.balance.club.investor.targetTighter : 0;
  const target = Math.max(1, Math.min(n, rank <= 2 ? rank + 1 : rank + data.balance.board.goals.leagueSlack) - tighter);
  let leagueLabel: string;
  if (target === 1) leagueLabel = level === 1 ? 'vyhrát titul' : 'vyhrát soutěž a postoupit';
  else if (target >= n - 3) leagueLabel = `zachránit se (do ${target}. místa)`;
  else leagueLabel = `skončit do ${target}. místa`;
  const cupRound = data.balance.board.goals.cupTargetRoundByLevelAndSize[`${level}`][`${(club?.size ?? 1) as ClubSize}`];
  const roundName = data.pyramid.cup.rounds[cupRound]?.name ?? '1. kolo';
  return { leaguePosition: target, leagueLabel, cupRound, cupLabel: `${data.pyramid.cup.name}: dostat se do kola „${roundName}“` };
}

export function startBoardSeason(state: GameState, data: GameData): void {
  const goals = boardGoals(state, data);
  const f = state.userClubId ? state.finances[state.userClubId] : undefined;
  if (!goals || !f) {
    state.board = null;
    return;
  }
  state.board = { goals, budget: seasonBudget(f, data.balance), grades: state.board?.grades ?? [] };
}

function gradeFromDiff(diff: number, thresholds: Record<string, number>): Grade {
  for (const g of GRADES.slice(0, 4)) if (diff >= (thresholds[g] ?? Infinity)) return g;
  return 'katastrofa';
}

/** Index of the furthest cup round the club reached (-1 = did not take part). */
export function cupRoundReached(state: GameState, clubId: string): number {
  let reached = -1;
  state.cup?.rounds.forEach((r, i) => {
    if (r.ties.some((t) => t.homeId === clubId || t.awayId === clubId)) reached = i;
  });
  if (state.cup?.winnerId === clubId) reached = state.cup.rounds.length;
  return reached;
}

/** Board evaluation of the season that just finished. */
export function evaluateSeason(state: GameState, data: GameData, relegated: boolean): SeasonEvaluation | null {
  const clubId = state.userClubId;
  const board = state.board;
  const comp = clubId ? state.membership[clubId] : undefined;
  if (!clubId || !board || !comp) return null;
  const b = data.balance.board;
  const order = finalStandings(state, data)[comp] ?? [];
  const position = order.indexOf(clubId) + 1;
  let league = gradeFromDiff(board.goals.leaguePosition - position, b.leaguePlacesBetterThanTarget);
  // Relegation that was not expected is a catastrophe.
  if (relegated && board.goals.leaguePosition < order.length - 3) league = 'katastrofa';
  const reached = cupRoundReached(state, clubId);
  const cup = state.cup ? gradeFromDiff(reached - board.goals.cupRound, b.cupRoundsBeyondTarget) : 'přijatelná';
  const score = (g: Grade) => b.gradeScore[g] ?? 0;
  const cupScore = score(cup);
  const total =
    b.weights.league[score(league) >= 0 ? 'success' : 'failure'] * score(league) +
    b.weights.cup[cupScore >= 0 ? 'success' : 'failure'] * cupScore;
  const overall: Grade = total >= 1.5 ? 'vynikající' : total >= 0.5 ? 'úspěšná' : total >= -0.5 ? 'přijatelná' : total >= -1.5 ? 'neúspěšná' : 'katastrofa';
  return { league, cup, overall, leaguePosition: position, cupReached: reached };
}

/** Sacking rule (design, section 10): a catastrophic season, or two failed seasons in a row. */
export function wouldBeSacked(grades: Grade[], data: GameData): boolean {
  const s = data.balance.board.sacking;
  const last = grades.at(-1);
  if (s.onCatastrophe && last === 'katastrofa') return true;
  const recent = grades.slice(-s.consecutiveFailures);
  return recent.length === s.consecutiveFailures && recent.every((g) => g === 'neúspěšná' || g === 'katastrofa');
}
