// The manager's team: line-up editing (formation, swaps) and preparing the team sheet for a match.
// Before every match unavailable players are replaced by the assistant and the manager is told.

import type { FormationId, GameData } from '../data.ts';
import {
  bestLineup,
  chooseBench,
  chooseLineup,
  chooseTactics,
  isAvailable,
  lineupStrength,
  slotValue,
  type LineupChoice,
  type Tactics,
  type TeamSheet,
} from '../lineup.ts';
import { POSITION_LABEL_CS, type Player, type Position } from '../types.ts';
import type { NewsItem, UserLineup, UserTeamState } from './state.ts';

export type LineupRef = { area: 'xi'; index: number } | { area: 'bench'; index: number } | { area: 'reserve'; playerId: string };

const nameOf = (p: Player) => `${p.firstName} ${p.lastName}`;

/** Assistant's proposal: formation, XI, bench and tactics. */
export function assistantProposal(squad: readonly Player[], data: GameData, opponentStrength: number): { lineup: UserLineup; tactics: Tactics } {
  const { balance } = data;
  const available = squad.filter(isAvailable).sort((a, b) => a.id.localeCompare(b.id));
  const choice = chooseLineup(data.tactics.formations, available, balance);
  const inXi = new Set(choice.lineup.filter((p): p is Player => p !== null).map((p) => p.id));
  const bench = chooseBench(available.filter((p) => !inXi.has(p.id)), balance.match.subs.benchSize, balance);
  return {
    lineup: { slots: choice.slots, playerIds: choice.lineup.map((p) => p?.id ?? null), benchIds: bench.map((p) => p.id) },
    tactics: chooseTactics(choice, opponentStrength, balance),
  };
}

/** Initial state of the manager's team: the assistant's proposal. */
export function initialUserTeam(squad: readonly Player[], data: GameData): UserTeamState {
  const { lineup, tactics } = assistantProposal(squad, data, 0);
  return { tactics: { ...tactics, mentality: 'balanced' }, lineup, autoLineup: false, training: 'assistant', matches: [] };
}

function toChoice(lineup: UserLineup, byId: Map<string, Player>, formation: FormationId): LineupChoice {
  return {
    formation,
    slots: lineup.slots,
    lineup: lineup.playerIds.map((id) => (id ? (byId.get(id) ?? null) : null)),
    total: 0,
  };
}

/** Strength of the manager's current XI (for the AI opponent's tactics). */
export function userStrength(user: UserTeamState, byId: Map<string, Player>, data: GameData): number {
  return lineupStrength(toChoice(user.lineup, byId, user.tactics.formation), data.balance);
}

/** New formation: the same XI players are re-assigned optimally to the new slots. */
export function changeFormation(user: UserTeamState, formationId: FormationId, squad: readonly Player[], data: GameData): void {
  const formation = data.tactics.formations.find((f) => f.id === formationId);
  if (!formation) throw new Error(`Neznámé rozestavení ${formationId}`);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const xi = user.lineup.playerIds.map((id) => (id ? byId.get(id) : undefined)).filter((p): p is Player => p !== undefined);
  const choice = bestLineup(formation, xi, data.balance);
  user.lineup = { slots: [...formation.slots], playerIds: choice.lineup.map((p) => p?.id ?? null), benchIds: user.lineup.benchIds };
  user.tactics = { ...user.tactics, formation: formationId };
}

/**
 * Swaps two places: an XI slot, a bench place, or a reserve player (in the squad but neither in
 * the XI nor on the bench). A bench index equal to the bench length means "append" (up to the
 * bench size). A player pushed out of the XI by a reserve becomes a reserve.
 */
export function swapPlayers(user: UserTeamState, a: LineupRef, b: LineupRef, data: GameData): void {
  if (a.area === 'reserve' && b.area === 'reserve') return;
  const max = data.balance.match.subs.benchSize;
  const xi = [...user.lineup.playerIds];
  const bench: (string | null)[] = [...user.lineup.benchIds];
  for (const r of [a, b]) if (r.area === 'bench' && r.index >= bench.length && bench.length >= max) return;

  const get = (r: LineupRef): string | null =>
    r.area === 'xi' ? (xi[r.index] ?? null) : r.area === 'bench' ? (bench[r.index] ?? null) : r.playerId;
  const put = (r: LineupRef, id: string | null) => {
    if (r.area === 'xi') xi[r.index] = id;
    else if (r.area === 'bench') {
      if (r.index < bench.length) bench[r.index] = id;
      else if (id !== null) bench.push(id);
    }
  };
  const idA = get(a);
  const idB = get(b);
  put(a, idB);
  put(b, idA);

  // Each player at most once: the XI wins over the bench.
  const seen = new Set<string>();
  const playerIds = xi.map((id) => (id !== null && !seen.has(id) ? (seen.add(id), id) : null));
  const benchIds = bench.filter((id): id is string => id !== null && !seen.has(id) && (seen.add(id), true));
  user.lineup = { slots: user.lineup.slots, playerIds, benchIds };
}

/** The assistant replaces the whole line-up (keeps the manager's style, mentality and pressing). */
export function applyAssistantLineup(user: UserTeamState, squad: readonly Player[], data: GameData, opponentStrength = 0): void {
  const proposal = assistantProposal(squad, data, opponentStrength);
  user.lineup = proposal.lineup;
  user.tactics = {
    ...user.tactics,
    formation: proposal.tactics.formation,
    ...(proposal.tactics.captainId ? { captainId: proposal.tactics.captainId } : {}),
    ...(proposal.tactics.setPieceTakerId ? { setPieceTakerId: proposal.tactics.setPieceTakerId } : {}),
  };
}

/**
 * Team sheet for the manager's next match. Unavailable players are replaced by the best
 * available fit and the change is reported. The fixed line-up is stored back into `user`.
 */
export function prepareUserSheet(
  clubId: string,
  user: UserTeamState,
  squad: readonly Player[],
  data: GameData,
  opponentStrength: number,
  date: string,
): { sheet: TeamSheet; news: NewsItem[] } {
  const { balance } = data;
  const news: NewsItem[] = [];
  if (user.autoLineup) applyAssistantLineup(user, squad, data, opponentStrength);

  const byId = new Map(squad.map((p) => [p.id, p]));
  const used = new Set<string>();
  const lineup: (Player | null)[] = user.lineup.slots.map(() => null);
  const vacancies: number[] = [];
  user.lineup.slots.forEach((_, i) => {
    const id = user.lineup.playerIds[i];
    const p = id ? byId.get(id) : undefined;
    if (p && isAvailable(p) && !used.has(p.id)) {
      lineup[i] = p;
      used.add(p.id);
    } else {
      vacancies.push(i);
    }
  });
  for (const i of vacancies) {
    const slot = user.lineup.slots[i] as Position;
    const missingId = user.lineup.playerIds[i];
    const missing = missingId ? byId.get(missingId) : undefined;
    const candidates = squad.filter((p) => isAvailable(p) && !used.has(p.id));
    const benchFirst = candidates.sort(
      (a, b) => slotValue(b, slot, balance) - slotValue(a, slot, balance) || a.id.localeCompare(b.id),
    );
    const replacement = benchFirst[0];
    if (replacement) {
      lineup[i] = replacement;
      used.add(replacement.id);
    }
    if (missing || replacement) {
      const reason = missing?.state.injury ? 'zranění' : missing && missing.state.suspensionMatches > 0 ? 'stopka' : 'chybí';
      news.push({
        date,
        kind: 'lineup',
        text: replacement
          ? `Asistent nahradil v sestavě ${missing ? `${nameOf(missing)} (${reason})` : 'prázdné místo'} hráčem ${nameOf(replacement)} (${POSITION_LABEL_CS[slot]}).`
          : `Na pozici ${POSITION_LABEL_CS[slot]} není nikdo k dispozici, tým nastoupí v oslabení.`,
        ...(replacement ? { playerId: replacement.id } : {}),
      });
    }
  }

  const benchWanted = user.lineup.benchIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined && isAvailable(p) && !used.has(p.id));
  const restPool = squad.filter((p) => isAvailable(p) && !used.has(p.id) && !benchWanted.includes(p));
  const bench = [...benchWanted];
  if (!bench.some((p) => p.positions[0] === 'GK')) {
    const gk = chooseBench(restPool, 1, balance).find((p) => p.positions[0] === 'GK');
    if (gk) bench.unshift(gk);
  }
  for (const p of chooseBench(restPool.filter((x) => !bench.includes(x)), balance.match.subs.benchSize, balance)) {
    if (bench.length >= balance.match.subs.benchSize) break;
    bench.push(p);
  }
  bench.splice(balance.match.subs.benchSize);

  const onPitch = lineup.filter((p): p is Player => p !== null);
  const inXi = (id?: string) => id !== undefined && onPitch.some((p) => p.id === id);
  const fallback = chooseTactics(toChoice({ ...user.lineup, playerIds: lineup.map((p) => p?.id ?? null) }, byId, user.tactics.formation), opponentStrength, balance);
  const tactics: Tactics = {
    ...user.tactics,
    ...(inXi(user.tactics.captainId) ? {} : fallback.captainId ? { captainId: fallback.captainId } : {}),
    ...(inXi(user.tactics.setPieceTakerId) ? {} : fallback.setPieceTakerId ? { setPieceTakerId: fallback.setPieceTakerId } : {}),
  };

  user.lineup = { slots: user.lineup.slots, playerIds: lineup.map((p) => p?.id ?? null), benchIds: bench.map((p) => p.id) };
  user.tactics = tactics;
  return { sheet: { clubId, slots: [...user.lineup.slots], lineup, bench, tactics: { ...tactics } }, news };
}

// ---------------------------------------------------------------- A-team / B-team / academy (design, section 3)

export type SquadTarget = 'A' | 'B' | 'academy';

/** B-team of the club that currently plays in a simulated competition (or undefined). */
export function activeReserveTeam(data: GameData, membership: Record<string, string>, clubId: string): string | undefined {
  return data.clubs.find((c) => c.parentClubId === clubId && membership[c.id])?.id;
}

/**
 * Moves one of the manager's players between the A-team, the B-team and the academy.
 * Returns an error message (Czech) when the move is not allowed.
 */
export function moveUserPlayer(
  player: Player,
  target: SquadTarget,
  clubId: string,
  user: UserTeamState,
  data: GameData,
  membership: Record<string, string>,
  ageNow: number,
): string | null {
  const bId = activeReserveTeam(data, membership, clubId);
  if (target === 'B' && !bId) return 'Klub nemá B-tým v soutěži.';
  if (target === 'academy' && ageNow >= data.balance.academy.releaseAtAge)
    return `Do akademie může jen hráč mladší ${data.balance.academy.releaseAtAge} let.`;
  if (target === 'A') {
    player.clubId = clubId;
    player.academy = false;
  } else if (target === 'B') {
    player.clubId = bId as string;
    player.academy = false;
  } else {
    player.clubId = clubId;
    player.academy = true;
  }
  if (target !== 'A') {
    user.lineup = {
      ...user.lineup,
      playerIds: user.lineup.playerIds.map((id) => (id === player.id ? null : id)),
      benchIds: user.lineup.benchIds.filter((id) => id !== player.id),
    };
  }
  return null;
}
