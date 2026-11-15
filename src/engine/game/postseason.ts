// Post-season of the 1st league (design, section 2; format confirmed by the user):
// after 30 rounds the top 6 play the title group and 11.–16. the relegation group, both single
// round robin with points carried over; 7.–10. play a placement play-off. Then the barrage
// (14./15. of the 1st league vs 2./3. of the 2nd league, two legs).

import type { GameData } from '../data.ts';
import { Rng } from '../rng.ts';
import { singleRoundRobin } from '../schedule.ts';
import { computeTable } from '../table.ts';
import type { CompetitionId, TableRow } from '../types.ts';
import { addDays, SATURDAY, weekdayOnOrAfter } from './calendar.ts';
import { canPlayIn } from './pyramid.ts';
import type { DatedFixture, GameState, MatchSummary, StageId, StageProgress } from './state.ts';

export const seasonRngOf = (state: Pick<GameState, 'seed' | 'seasonYear'>) => new Rng(`${state.seed}/season-${state.seasonYear}`);

export function stageOf(state: GameState, id: StageId): StageProgress | undefined {
  return state.stages.find((s) => s.id === id);
}

const stageDone = (s: StageProgress | undefined) => s !== undefined && s.results.length === s.fixtures.length;

export function regularTable(state: GameState, competitionId: CompetitionId, data: GameData): TableRow[] {
  const progress = state.competitions.find((c) => c.id === competitionId);
  const competition = data.competitions.find((c) => c.id === competitionId);
  if (!progress || !competition) return [];
  return computeTable(progress.clubIds, progress.results, competition, `${seasonRngOf(state).seed}/${competitionId}/lot`, deductionsOf(state));
}

/** Points deducted this season (licence). */
export function deductionsOf(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, f] of Object.entries(state.finances ?? {})) if (f.pointDeduction > 0) out[id] = f.pointDeduction;
  return out;
}

/** Table of a post-season group: points from the regular season carry over. */
export function groupTable(state: GameState, stageId: 'title-group' | 'relegation-group', data: GameData): TableRow[] {
  const firstId = data.pyramid.firstLeague.id;
  const progress = state.competitions.find((c) => c.id === firstId);
  const stage = stageOf(state, stageId);
  const competition = data.competitions.find((c) => c.id === firstId);
  if (!progress || !stage || !competition) return [];
  const groupResults = state.stages.filter((s) => s.id === 'title-group' || s.id === 'relegation-group').flatMap((s) => s.results);
  const all = computeTable(progress.clubIds, [...progress.results, ...groupResults], competition, `${seasonRngOf(state).seed}/${firstId}/lot`, deductionsOf(state));
  return all.filter((r) => stage.clubIds.includes(r.clubId));
}

/** Winner of a single knockout match or of a two-legged tie. */
export function knockoutWinner(results: MatchSummary[]): string | null {
  const last = results.at(-1);
  if (!last) return null;
  if (last.penalties) return last.penalties[0] > last.penalties[1] ? last.homeId : last.awayId;
  const goals = new Map<string, number>();
  for (const r of results) {
    goals.set(r.homeId, (goals.get(r.homeId) ?? 0) + r.homeGoals);
    goals.set(r.awayId, (goals.get(r.awayId) ?? 0) + r.awayGoals);
  }
  const [a, b] = [last.homeId, last.awayId];
  const ga = goals.get(a) ?? 0;
  const gb = goals.get(b) ?? 0;
  return ga === gb ? null : ga > gb ? a : b;
}

function saturdaysAfter(date: string, n: number): string[] {
  const first = weekdayOnOrAfter(addDays(date, 1), SATURDAY);
  return Array.from({ length: n }, (_, i) => addDays(first, 7 * i));
}

function lastDate(...dates: (string | undefined)[]): string {
  return dates.filter((d): d is string => d !== undefined).sort().at(-1) ?? '';
}

/** Creates the next post-season stages when their prerequisites are complete. Returns true if something was created. */
export function progressPostseason(state: GameState, data: GameData): boolean {
  const p = data.pyramid.firstLeague;
  const first = state.competitions.find((c) => c.id === p.id);
  const second = state.competitions.find((c) => c.id === data.pyramid.secondLeague.id);
  if (!first || !second || first.playedRounds < first.roundDates.length) return false;
  const rng = seasonRngOf(state).fork('postseason');
  let created = false;

  if (!stageOf(state, 'title-group')) {
    const table = regularTable(state, p.id, data).map((r) => r.clubId);
    const slice = ([from, to]: [number, number]) => table.slice(from - 1, to);
    const groupDates = saturdaysAfter(first.roundDates.at(-1) as string, 5);
    for (const [id, clubs] of [
      ['title-group', slice(p.titleGroup)],
      ['relegation-group', slice(p.relegationGroup)],
    ] as const) {
      const rounds = singleRoundRobin(rng.fork(id).shuffle(clubs));
      const fixtures: DatedFixture[] = rounds.flatMap((pairs, i) =>
        pairs.map(([homeId, awayId]) => ({ round: i + 1, homeId, awayId, date: groupDates[i] ?? (groupDates.at(-1) as string) })),
      );
      state.stages.push({ id, clubIds: [...clubs], fixtures, results: [] });
    }
    const po = slice(p.placementPlayoff);
    state.stages.push({
      id: 'placement-semi',
      clubIds: po,
      fixtures: [
        { round: 1, homeId: po[0] as string, awayId: po[3] as string, date: groupDates[1] as string, knockout: true },
        { round: 1, homeId: po[1] as string, awayId: po[2] as string, date: groupDates[1] as string, knockout: true },
      ],
      results: [],
    });
    created = true;
  }

  const semi = stageOf(state, 'placement-semi');
  if (stageDone(semi) && !stageOf(state, 'placement-final') && semi) {
    const winners = semi.results.map((r) => knockoutWinner([r]) as string);
    const order = semi.clubIds;
    const [home, away] = [...winners].sort((a, b) => order.indexOf(a) - order.indexOf(b)) as [string, string];
    const date = addDays(semi.fixtures[0]?.date as string, 14);
    state.stages.push({ id: 'placement-final', clubIds: [home, away], fixtures: [{ round: 1, homeId: home, awayId: away, date, knockout: true }], results: [] });
    created = true;
  }

  const groupsDone = stageDone(stageOf(state, 'title-group')) && stageDone(stageOf(state, 'relegation-group')) && stageDone(stageOf(state, 'placement-final'));
  if (groupsDone && second.playedRounds >= second.roundDates.length && !stageOf(state, 'barrage')) {
    const firstOrder = firstLeagueOrder(state, data);
    const secondOrder = regularTable(state, second.id, data).map((r) => r.clubId);
    // Clubs of the 2nd league that may play the 1st league, without the directly promoted one(s).
    const eligible = secondOrder.filter((id) => canPlayIn(data, { ...state.membership, [id]: p.id }, id, p.id));
    const promotedDirectly = eligible.slice(0, data.pyramid.secondLeague.directPromotion);
    const candidates = eligible.filter((id) => !promotedDirectly.includes(id));
    const [d1, d2] = saturdaysAfter(
      lastDate(...state.stages.flatMap((s) => s.fixtures.map((f) => f.date)), second.roundDates.at(-1)),
      2,
    ) as [string, string];
    const fixtures: DatedFixture[] = [];
    const clubIds: string[] = [];
    p.barrage.pairs.forEach(([firstPos, secondPos], tie) => {
      const firstClub = firstOrder[firstPos - 1];
      // The n-th place of the 2nd league among eligible clubs (B-teams are skipped).
      const secondClub = candidates[secondPos - 1 - data.pyramid.secondLeague.directPromotion];
      if (!firstClub || !secondClub) return;
      clubIds.push(firstClub, secondClub);
      fixtures.push({ round: 1, homeId: secondClub, awayId: firstClub, date: d1, tie, leg: 1 });
      fixtures.push({ round: 2, homeId: firstClub, awayId: secondClub, date: d2, tie, leg: 2, knockout: true });
    });
    state.stages.push({ id: 'barrage', clubIds, fixtures, results: [] });
    created = true;
  }
  return created;
}

/** Final order of the 1st league (regular table until the post-season is complete). */
export function firstLeagueOrder(state: GameState, data: GameData): string[] {
  const p = data.pyramid.firstLeague;
  const regular = regularTable(state, p.id, data).map((r) => r.clubId);
  const title = stageOf(state, 'title-group');
  const relegation = stageOf(state, 'relegation-group');
  const final = stageOf(state, 'placement-final');
  const semi = stageOf(state, 'placement-semi');
  if (!title || !relegation || !semi) return regular;
  const titleOrder = groupTable(state, 'title-group', data).map((r) => r.clubId);
  const relegationOrder = groupTable(state, 'relegation-group', data).map((r) => r.clubId);
  let playoff = semi.clubIds;
  if (final && stageDone(final) && stageDone(semi)) {
    const winner = knockoutWinner(final.results) as string;
    const runnerUp = final.clubIds.find((id) => id !== winner) as string;
    const losers = semi.clubIds.filter((id) => id !== winner && id !== runnerUp);
    playoff = [winner, runnerUp, ...losers.sort((a, b) => regular.indexOf(a) - regular.indexOf(b))];
  }
  return [...titleOrder, ...playoff, ...relegationOrder];
}

/** Winners of the barrage ties: [1st-league club, 2nd-league club, winner]. */
export function barrageOutcomes(state: GameState): [string, string, string][] {
  const stage = stageOf(state, 'barrage');
  if (!stage || !stageDone(stage)) return [];
  const ties = new Map<number, MatchSummary[]>();
  stage.fixtures.forEach((f) => {
    const r = stage.results.find((x) => x.homeId === f.homeId && x.awayId === f.awayId && x.round === f.round);
    if (r && f.tie !== undefined) ties.set(f.tie, [...(ties.get(f.tie) ?? []), r]);
  });
  return [...ties.values()].map((legs) => {
    const leg2 = legs.find((l) => l.round === 2) as MatchSummary;
    return [leg2.homeId, leg2.awayId, knockoutWinner(legs) as string];
  });
}

export function postseasonDone(state: GameState): boolean {
  const ids: StageId[] = ['title-group', 'relegation-group', 'placement-semi', 'placement-final', 'barrage'];
  return ids.every((id) => stageDone(stageOf(state, id)));
}

