// Team selection for AI clubs (and for the user's team when delegated to the assistant).
// Results are cached per club while the set of unavailable players stays the same.

import type { GameData } from '../data.ts';
import { chooseBench, chooseLineup, chooseTactics, isAvailable, lineupStrength, type LineupChoice, type TeamSheet } from '../lineup.ts';
import type { Player } from '../types.ts';

export interface Selection {
  key: string;
  choice: LineupChoice;
  strength: number;
  rest: Player[];
}

export type SelectionCache = Map<string, Selection>;

export function selectionFor(clubId: string, squad: readonly Player[], data: GameData, cache?: SelectionCache): Selection {
  const minCondition = data.balance.rotation.minCondition;
  const fresh = squad.filter((p) => isAvailable(p) && p.state.condition >= minCondition);
  // Tired players rest when there are enough fresh ones (incl. a goalkeeper).
  const rotate = fresh.length >= 14 && fresh.some((p) => p.positions[0] === 'GK');
  const usable = (p: Player) => isAvailable(p) && (!rotate || p.state.condition >= minCondition);
  const key = squad
    .filter((p) => !usable(p))
    .map((p) => p.id)
    .join(',');
  const cached = cache?.get(clubId);
  if (cached && cached.key === key) return cached;
  const available = squad.filter(usable);
  const choice = chooseLineup(data.tactics.formations, available, data.balance);
  const inXi = new Set(choice.lineup.filter((p): p is Player => p !== null).map((p) => p.id));
  const entry: Selection = { key, choice, strength: lineupStrength(choice, data.balance), rest: available.filter((p) => !inXi.has(p.id)) };
  cache?.set(clubId, entry);
  return entry;
}

export function aiSheet(clubId: string, sel: Selection, opponentStrength: number, data: GameData): TeamSheet {
  const { balance } = data;
  return {
    clubId,
    slots: sel.choice.slots,
    lineup: sel.choice.lineup,
    bench: chooseBench(sel.rest, balance.match.subs.benchSize, balance),
    tactics: chooseTactics(sel.choice, opponentStrength, balance),
  };
}
