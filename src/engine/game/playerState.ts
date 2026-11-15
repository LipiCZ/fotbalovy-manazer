// Player state between matches: condition, form, cards, injuries, suspensions.

import type { Balance } from '../data.ts';
import type { MatchReport } from '../match/types.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../types.ts';
import { addDays } from './calendar.ts';

/** Applies a finished match to the players' state (condition, form, cards, injuries). */
export function applyMatchToPlayers(report: MatchReport, players: Map<string, Player>, balance: Balance, rng: Rng): void {
  const d = balance.discipline;
  for (const line of report.players) {
    const p = players.get(line.playerId);
    if (!p) continue;
    const s = p.state;
    // Cards and injuries count even for a player who was on the pitch for no full minute.
    if (line.minutesPlayed > 0) {
      s.condition = line.conditionEnd;
      if ((s.returnFormMatches ?? 0) > 0) s.returnFormMatches = (s.returnFormMatches ?? 0) - 1;
      s.recentRatings.push(line.rating);
      if (s.recentRatings.length > balance.form.historyLength) s.recentRatings.splice(0, s.recentRatings.length - balance.form.historyLength);
    }
    if (line.red === 'secondYellow') {
      s.suspensionMatches += d.secondYellowBan;
    } else {
      if (line.yellow > 0) {
        s.yellowCards += line.yellow;
        if (s.yellowCards % d.yellowsPerBan === 0) s.suspensionMatches += d.yellowAccumulationBan;
      }
      if (line.red === 'straight') s.suspensionMatches += rng.weightedPick(d.straightRedBan.matches, d.straightRedBan.weights);
    }
    if (line.injury) {
      s.injury = { ...line.injury };
      s.seasonInjuryDays = (s.seasonInjuryDays ?? 0) + line.injury.daysLeft;
    }
  }
}

/**
 * A player returns from an injury: lower condition, worse form for a few matches and a higher
 * risk of getting injured again for a while (design, section 12).
 */
export function returnFromInjury(p: Player, date: string, balance: Balance): void {
  const a = balance.injuries.afterReturn;
  delete p.state.injury;
  p.state.condition = Math.min(p.state.condition, a.condition);
  p.state.returnFormMatches = a.formMatches;
  p.state.reinjuryUntil = addDays(date, a.reinjuryDays);
}

/** Days pass: condition recovers, injuries heal. Returns players whose injury healed. */
export function passDays(players: Iterable<Player>, days: number, balance: Balance, date = '2000-01-01'): Player[] {
  const healed: Player[] = [];
  if (days <= 0) return healed;
  for (const p of players) {
    const s = p.state;
    s.condition = Math.min(100, s.condition + balance.condition.recoveryPerDay * days);
    if (s.injury) {
      s.injury.daysLeft -= days;
      if (s.injury.daysLeft <= 0) {
        returnFromInjury(p, date, balance);
        healed.push(p);
      }
    }
  }
  return healed;
}
