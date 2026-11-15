// League table: accumulates results and sorts by the competition's tie-breakers.
//
// Tie-breaking: teams level on points form a group. Head-to-head criteria (h2h*) are computed
// from the matches among the teams of that group only (a mini-table). Criteria are applied in
// order; teams still level move on to the next criterion. 'lot' is a deterministic draw derived
// from `lotSeed`, so the same results always give the same table.

import { hashString } from './rng.ts';
import type { MatchResult, TableRow, TiebreakCriterion } from './types.ts';

export interface TableRules {
  pointsForWin: number;
  pointsForDraw: number;
  tiebreakers: TiebreakCriterion[];
}

interface MiniStats {
  points: number;
  goalDiff: number;
  goalsFor: number;
}

function emptyRow(clubId: string): TableRow {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
}

function applyResult(home: TableRow, away: TableRow, r: MatchResult, rules: TableRules): void {
  home.played++;
  away.played++;
  home.goalsFor += r.homeGoals;
  home.goalsAgainst += r.awayGoals;
  away.goalsFor += r.awayGoals;
  away.goalsAgainst += r.homeGoals;
  if (r.homeGoals > r.awayGoals) {
    home.won++;
    away.lost++;
    home.points += rules.pointsForWin;
  } else if (r.homeGoals < r.awayGoals) {
    away.won++;
    home.lost++;
    away.points += rules.pointsForWin;
  } else {
    home.drawn++;
    away.drawn++;
    home.points += rules.pointsForDraw;
    away.points += rules.pointsForDraw;
  }
  home.goalDiff = home.goalsFor - home.goalsAgainst;
  away.goalDiff = away.goalsFor - away.goalsAgainst;
}

/** Unsorted table rows (one per club, including clubs with no matches yet). */
export function accumulate(clubIds: readonly string[], results: readonly MatchResult[], rules: TableRules): TableRow[] {
  const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]));
  for (const r of results) {
    const home = rows.get(r.homeId);
    const away = rows.get(r.awayId);
    if (!home || !away) throw new Error(`Výsledek ${r.homeId}–${r.awayId}: tým není v tabulce`);
    if (r.homeId === r.awayId) throw new Error(`Výsledek: tým ${r.homeId} nemůže hrát sám se sebou`);
    applyResult(home, away, r, rules);
  }
  return [...rows.values()];
}

function miniTable(group: readonly string[], results: readonly MatchResult[], rules: TableRules): Map<string, MiniStats> {
  const members = new Set(group);
  const rows = accumulate(
    group,
    results.filter((r) => members.has(r.homeId) && members.has(r.awayId)),
    rules,
  );
  return new Map(rows.map((r) => [r.clubId, { points: r.points, goalDiff: r.goalDiff, goalsFor: r.goalsFor }]));
}

/** Sorted league table. */
export function computeTable(
  clubIds: readonly string[],
  results: readonly MatchResult[],
  rules: TableRules,
  lotSeed = 'lot',
  /** Points deducted (e.g. licence, design section 13). */
  deductions: Readonly<Record<string, number>> = {},
): TableRow[] {
  const rows = accumulate(clubIds, results, rules);
  for (const r of rows) r.points -= deductions[r.clubId] ?? 0;
  const byId = new Map(rows.map((r) => [r.clubId, r]));

  const value = (crit: TiebreakCriterion, id: string, h2h: Map<string, MiniStats> | undefined): number => {
    const row = byId.get(id) as TableRow;
    switch (crit) {
      case 'points':
        return row.points;
      case 'goalDiff':
        return row.goalDiff;
      case 'goalsFor':
        return row.goalsFor;
      case 'wins':
        return row.won;
      case 'h2hPoints':
        return h2h?.get(id)?.points ?? 0;
      case 'h2hGoalDiff':
        return h2h?.get(id)?.goalDiff ?? 0;
      case 'h2hGoalsFor':
        return h2h?.get(id)?.goalsFor ?? 0;
      case 'lot':
        return hashString(`${lotSeed}:${id}`);
    }
  };

  const rank = (group: string[], critIdx: number, h2h: Map<string, MiniStats> | undefined): string[] => {
    if (group.length <= 1) return group;
    const crit = rules.tiebreakers[critIdx];
    // Out of criteria: fall back to a stable deterministic order.
    if (crit === undefined) return [...group].sort((a, b) => value('lot', b, undefined) - value('lot', a, undefined) || a.localeCompare(b));

    // The head-to-head mini-table is built once, for the group level on points.
    const ctx = crit.startsWith('h2h') && h2h === undefined ? miniTable(group, results, rules) : h2h;
    const sorted = [...group].sort((a, b) => value(crit, b, ctx) - value(crit, a, ctx));

    const out: string[] = [];
    let i = 0;
    while (i < sorted.length) {
      const v = value(crit, sorted[i] as string, ctx);
      let j = i + 1;
      while (j < sorted.length && value(crit, sorted[j] as string, ctx) === v) j++;
      const tied = sorted.slice(i, j);
      // Leaving the points level resets the head-to-head context for the next sub-group.
      out.push(...rank(tied, critIdx + 1, crit === 'points' ? undefined : ctx));
      i = j;
    }
    return out;
  };

  return rank(clubIds.slice(), 0, undefined).map((id) => byId.get(id) as TableRow);
}
