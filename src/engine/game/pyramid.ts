// Rules of the competition pyramid: who may play where (B-teams), regional groups of the 3rd level.

import type { GameData } from '../data.ts';
import type { Club, CompetitionId, Level } from '../types.ts';

export type Membership = Record<string, CompetitionId>;

export function levelOfCompetition(data: GameData, id: CompetitionId): Level {
  const c = data.competitions.find((x) => x.id === id);
  if (!c) throw new Error(`Neznámá soutěž ${id}`);
  return c.level;
}

/** Organisation of a club (A-team id for B/C teams). */
export const orgOf = (club: Club) => club.parentClubId ?? club.id;

/**
 * May a club play in a competition (design, section 2)? A B/C team may not play the 1st league,
 * nor the same or a higher level than its A-team, nor alongside another team of its club.
 */
export function canPlayIn(data: GameData, membership: Membership, clubId: string, competitionId: CompetitionId): boolean {
  const club = data.clubs.find((c) => c.id === clubId);
  if (!club) return false;
  const level = levelOfCompetition(data, competitionId);
  if (club.parentClubId) {
    if (level === 1) return false;
    const parentComp = membership[club.parentClubId];
    if (!parentComp || levelOfCompetition(data, parentComp) >= level) return false;
  }
  return !data.clubs.some((other) => other.id !== clubId && orgOf(other) === orgOf(club) && membership[other.id] === competitionId);
}

export function thirdLevelGroups(data: GameData): CompetitionId[] {
  return Object.keys(data.pyramid.thirdLevel.groups) as CompetitionId[];
}

/** Groups of the 3rd level a club may be placed in by its region. */
export function allowedGroups(data: GameData, club: Club): CompetitionId[] {
  const t = data.pyramid.thirdLevel;
  const flexible = t.flexibleRegions[club.regionId];
  if (flexible) return flexible;
  return thirdLevelGroups(data).filter((g) => t.groups[g]?.regions.includes(club.regionId));
}

export function membersOf(membership: Membership, competitionId: CompetitionId): string[] {
  return Object.keys(membership).filter((id) => membership[id] === competitionId);
}
