// MOL Cup (design, section 2): single knockout matches, extra time and penalties, the lower-level
// club at home in the early rounds, the final at a neutral venue. Only A-teams take part.
// Byes (to fill the bracket to a power of two) go to the best clubs of the 1st league from the
// previous season – a stand-in for clubs entering later because of European cups.

import type { GameData } from '../data.ts';
import type { Rng } from '../rng.ts';
import { seasonDate, WEDNESDAY, weekdayOnOrAfter } from './calendar.ts';
import { knockoutWinner } from './postseason.ts';
import { levelOfCompetition } from './pyramid.ts';
import type { CupRound, CupState, CupTie, GameState } from './state.ts';

export function cupLevel(state: GameState, data: GameData, clubId: string): number {
  const comp = state.membership[clubId];
  return comp ? levelOfCompetition(data, comp) : 9;
}

/** Pairs teams randomly; in the early rounds the lower-level club plays at home. */
function drawTies(teams: string[], roundIndex: number, state: GameState, data: GameData, rng: Rng): CupTie[] {
  const shuffled = rng.shuffle(teams);
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    let [home, away] = [shuffled[i] as string, shuffled[i + 1] as string];
    if (roundIndex < data.pyramid.cup.lowerLevelAtHomeRounds && cupLevel(state, data, home) < cupLevel(state, data, away)) [home, away] = [away, home];
    ties.push({ homeId: home, awayId: away });
  }
  return ties;
}

/**
 * New cup for the season. `seeds` = clubs ordered by strength (previous season's 1st league
 * order first); the best of them get byes in the first round.
 */
export function createCup(state: GameState, data: GameData, seeds: string[], rng: Rng): CupState {
  const teams = data.clubs.filter((c) => !c.parentClubId && state.membership[c.id]).map((c) => c.id);
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, teams.length)));
  const roundsCount = Math.log2(size);
  const roundDefs = data.pyramid.cup.rounds.slice(-roundsCount);
  if (roundDefs.length < roundsCount) throw new Error('Pohár: v datech je málo kol pro počet týmů');
  const rounds: CupRound[] = roundDefs.map((r) => ({
    name: r.name,
    date: weekdayOnOrAfter(seasonDate(r.date, state.seasonYear), WEDNESDAY),
    ...(r.neutral ? { neutral: true } : {}),
    ties: [],
  }));
  const byes = size - teams.length;
  const ordered = [...seeds.filter((id) => teams.includes(id)), ...teams.filter((id) => !seeds.includes(id))];
  const byeTeams = ordered.slice(0, byes);
  const playing = teams.filter((id) => !byeTeams.includes(id));
  (rounds[0] as CupRound).ties = [
    ...byeTeams.map((id): CupTie => ({ homeId: id, awayId: null, winnerId: id })),
    ...drawTies(playing, 0, state, data, rng.fork('round-0')),
  ];
  return { rounds, current: 0 };
}

/** After a round is complete: record winners and draw the next round (or crown the winner). */
export function progressCup(state: GameState, data: GameData, rng: Rng): void {
  const cup = state.cup;
  if (!cup || cup.winnerId) return;
  const round = cup.rounds[cup.current];
  if (!round) return;
  for (const tie of round.ties) if (!tie.winnerId && tie.result) tie.winnerId = knockoutWinner([tie.result]) ?? undefined;
  if (!round.ties.every((t) => t.winnerId)) return;
  const winners = round.ties.map((t) => t.winnerId as string);
  cup.current++;
  const next = cup.rounds[cup.current];
  if (!next) {
    cup.winnerId = winners[0];
    return;
  }
  next.ties = drawTies(winners, cup.current, state, data, rng.fork(`round-${cup.current}`));
}

/** Next cup date with unplayed ties (null when the cup is over). */
export function nextCupDate(state: GameState): string | null {
  const cup = state.cup;
  if (!cup || cup.winnerId) return null;
  const round = cup.rounds[cup.current];
  return round && round.ties.some((t) => t.awayId !== null && !t.result) ? round.date : null;
}

export function cupFinished(state: GameState): boolean {
  return !state.cup || state.cup.winnerId !== undefined;
}
