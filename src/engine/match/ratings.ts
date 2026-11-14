// Player ratings 1–10 (design, section 12):
// base 6.0; goal +1.0; assist +0.6; key pass +0.2; error leading to a goal −0.8; red card −1.5;
// goalkeeper save +0.15; goalkeeper goal conceded −0.3; team result ±0.3.
// On top: a small performance component (better players in their slot rate slightly higher,
// noise depends on consistency), scaled by minutes played.

import type { Balance } from '../data.ts';
import { positionFit } from '../lineup.ts';
import { celAt } from '../players/rating.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../types.ts';
import type { MatchReport, PlayerMatchLine } from './types.ts';

/** Sets `rating` on every player line and returns the man of the match (or null). */
export function computeRatings(report: MatchReport, players: Map<string, Player>, balance: Balance, rng: Rng): string | null {
  const r = balance.ratings;
  const fullMatch = 2 * balance.match.halfMinutes;
  const played = report.players.filter((l) => l.minutesPlayed > 0);
  if (played.length === 0) return null;

  const value = (l: PlayerMatchLine) => {
    const p = players.get(l.playerId);
    return p ? celAt(p, l.slot, balance) * positionFit(p, l.slot, balance) : 0;
  };
  const starters = played.filter((l) => l.started);
  const avgValue = starters.reduce((s, l) => s + value(l), 0) / Math.max(1, starters.length);

  for (const line of played) {
    const p = players.get(line.playerId);
    const share = Math.min(1, line.minutesPlayed / fullMatch);
    const consistency = p?.hidden.consistency ?? 50;
    const own = line.side === 'home' ? report.homeGoals : report.awayGoals;
    const opp = line.side === 'home' ? report.awayGoals : report.homeGoals;
    const resultWeight = Math.min(1, line.minutesPlayed / (fullMatch / 2));

    let rating =
      r.base +
      share * (r.performanceMean + r.performanceSkill * (value(line) - avgValue)) +
      rng.normal(0, r.noiseSd * (1.5 - consistency / 100)) * Math.sqrt(share) +
      line.goals * r.goal +
      line.assists * r.assist +
      line.keyPasses * r.keyPass +
      line.errors * r.errorLeadingToGoal +
      (line.red !== 'none' ? r.redCard : 0) +
      line.saves * r.gkSave +
      line.conceded * r.gkConceded +
      (own > opp ? r.teamWin : own < opp ? r.teamLoss : 0) * resultWeight;
    rating = Math.min(r.max, Math.max(r.min, rating));
    line.rating = Math.round(rating * 10) / 10;
  }

  const winner = report.homeGoals > report.awayGoals ? 'home' : report.homeGoals < report.awayGoals ? 'away' : null;
  const best = [...played].sort(
    (a, b) =>
      b.rating - a.rating ||
      Number(b.side === winner) - Number(a.side === winner) ||
      b.goals - a.goals ||
      a.playerId.localeCompare(b.playerId),
  )[0];
  return best?.playerId ?? null;
}
