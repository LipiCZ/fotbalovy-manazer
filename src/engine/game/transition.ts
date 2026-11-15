// Season transition (1 July): promotions and relegations (design, section 2), career archive,
// exceptional seasons raising POT, retirements, new fixtures, cup draw, July academy intake.
// The pyramid is closed below the 3rd level for now (decided by the user): nobody is relegated
// from the 3rd level; a B-team that would have to go below it leaves the simulated competitions.

import type { GameData } from '../data.ts';
import { overall } from '../players/rating.ts';
import type { Club, CompetitionId, Player } from '../types.ts';
import {
  buildCompetitions,
  finalStandings,
  invalidateRuntime,
  leagueCelLookup,
  passTime,
  startCup,
} from './advance.ts';
import { seasonStart } from './calendar.ts';
import { academyIntake, exactAge, manageSquads, retirementChance } from './development.ts';
import { barrageOutcomes, regularTable, seasonRngOf } from './postseason.ts';
import { allowedGroups, canPlayIn, levelOfCompetition, membersOf, thirdLevelGroups, type Membership } from './pyramid.ts';
import { emptyStats, type GameState, type Movement, type NewsItem, type SeasonRecord } from './state.ts';

const nameOf = (p: Player) => `${p.firstName} ${p.lastName}`;

function clubOf(data: GameData, id: string): Club {
  const c = data.clubs.find((x) => x.id === id);
  if (!c) throw new Error(`Neznámý klub ${id}`);
  return c;
}

/** New membership for next season and the list of moves. Pure: does not change the state. */
export function computeMovements(state: GameState, data: GameData): { membership: Membership; movements: Movement[] } {
  const p = data.pyramid;
  const firstId = p.firstLeague.id;
  const secondId = p.secondLeague.id;
  const groups = thirdLevelGroups(data);
  const standings = finalStandings(state, data);
  const mem: Membership = { ...state.membership };
  const movements: Movement[] = [];
  const move = (clubId: string, to: CompetitionId | null, reason: Movement['reason']) => {
    const from = mem[clubId] ?? null;
    if (to === null) delete mem[clubId];
    else mem[clubId] = to;
    movements.push({ clubId, from, to, reason });
  };

  // 1st <-> 2nd league: direct relegation, direct promotion, barrage.
  const first = standings[firstId] ?? [];
  const second = standings[secondId] ?? [];
  for (const id of first.slice(first.length - p.firstLeague.directRelegation)) move(id, secondId, 'relegated');
  const eligibleUp = second.filter((id) => canPlayIn(data, { ...state.membership, [id]: firstId }, id, firstId));
  for (const id of eligibleUp.slice(0, p.secondLeague.directPromotion)) move(id, firstId, 'promoted');
  for (const [firstClub, secondClub, winner] of barrageOutcomes(state)) {
    if (winner === secondClub) {
      move(firstClub, secondId, 'barrage');
      move(secondClub, firstId, 'barrage');
    }
  }

  // 3rd level -> 2nd league: the best eligible club of each group.
  const promotedFromThird: string[] = [];
  for (const g of groups) {
    const order = standings[g] ?? [];
    const pick = order.filter((id) => canPlayIn(data, { ...mem, [id]: secondId }, id, secondId)).slice(0, p.thirdLevel.promotionPerGroup);
    for (const id of pick) {
      move(id, secondId, 'promoted');
      promotedFromThird.push(id);
    }
  }

  // B-teams that are no longer allowed where they are (A-team came down) go one level down.
  const forceDown = () => {
    for (const club of data.clubs) {
      const comp = mem[club.id];
      if (!club.parentClubId || !comp) continue;
      if (canPlayIn(data, mem, club.id, comp)) continue;
      const level = levelOfCompetition(data, comp);
      if (level >= 3) move(club.id, null, 'removed');
      else move(club.id, groups[0] as CompetitionId, 'forced'); // the real group is chosen below
    }
  };
  forceDown();

  // 2nd league back to its size: relegate from the bottom (clubs that just arrived from above are safe),
  // or promote more 3rd-level clubs when it is too small.
  const secondOrder = second.filter((id) => mem[id] === secondId);
  const size = () => membersOf(mem, secondId).length;
  for (let i = secondOrder.length - 1; i >= 0 && size() > p.secondLeague.size; i--) move(secondOrder[i] as string, groups[0] as CompetitionId, 'relegated');
  if (size() < p.secondLeague.size) {
    // Runners-up of the 3rd level by points per game.
    const pool = groups.flatMap((g) =>
      regularTable(state, g, data)
        .filter((r) => mem[r.clubId] === g && canPlayIn(data, { ...mem, [r.clubId]: secondId }, r.clubId, secondId))
        .map((r) => ({ id: r.clubId, ppg: r.points / Math.max(1, r.played) })),
    );
    pool.sort((a, b) => b.ppg - a.ppg || a.id.localeCompare(b.id));
    for (const c of pool) {
      if (size() >= p.secondLeague.size) break;
      move(c.id, secondId, 'promoted');
    }
  }
  forceDown();

  // 3rd level: newcomers (relegated or forced down) into a regional group, then balance the groups.
  const newcomers = movements.filter((m) => m.to !== null && groups.includes(m.to) && (m.from === null || !groups.includes(m.from))).map((m) => m.clubId);
  const groupSize = (g: CompetitionId) => membersOf(mem, g).length;
  const conflict = (clubId: string, g: CompetitionId) => !canPlayIn(data, { ...mem, [clubId]: g }, clubId, g);
  for (const id of newcomers) {
    const allowed = allowedGroups(data, clubOf(data, id));
    const options = (allowed.length > 0 ? allowed : groups).filter((g) => !conflict(id, g));
    const target = [...(options.length > 0 ? options : allowed)].sort((a, b) => groupSize(a) - groupSize(b) - ((p.thirdLevel.targetSizes[a] ?? 16) - (p.thirdLevel.targetSizes[b] ?? 16)))[0];
    if (target) mem[id] = target;
    const mv = [...movements].reverse().find((m) => m.clubId === id && m.to !== null);
    if (mv && target) mv.to = target;
  }
  // Balance: move clubs from flexible regions from an over-full group to an under-full one.
  for (let guard = 0; guard < 20; guard++) {
    const over = groups.map((g) => ({ g, d: groupSize(g) - (p.thirdLevel.targetSizes[g] ?? 16) })).sort((a, b) => b.d - a.d);
    const big = over[0];
    const small = over.at(-1);
    if (!big || !small || big.d - small.d < 2) break;
    const movable = membersOf(mem, big.g)
      .map((id) => clubOf(data, id))
      .filter((c) => allowedGroups(data, c).includes(small.g) && !conflict(c.id, small.g))
      .sort((a, b) => Number(newcomers.includes(b.id)) - Number(newcomers.includes(a.id)) || a.id.localeCompare(b.id))[0];
    if (!movable) break;
    mem[movable.id] = small.g;
    if (!newcomers.includes(movable.id)) movements.push({ clubId: movable.id, from: big.g, to: small.g, reason: 'regrouped' });
  }
  return { membership: mem, movements };
}

/** Moves the game into the next season. The current season must be finished. */
export function startNewSeason(state: GameState, data: GameData): NewsItem[] {
  if (!state.finished) throw new Error('Sezóna ještě neskončila');
  const { balance } = data;
  const news: NewsItem[] = [];
  const standings = finalStandings(state, data);
  const { membership, movements } = computeMovements(state, data);
  const userComp = state.userClubId ? (state.membership[state.userClubId] ?? null) : null;
  const userPos = state.userClubId && userComp ? (standings[userComp]?.indexOf(state.userClubId) ?? -1) + 1 || null : null;
  const record: SeasonRecord = {
    seasonYear: state.seasonYear,
    standings,
    cupWinnerId: state.cup?.winnerId ?? null,
    movements,
    userClubId: state.userClubId,
    userCompetitionId: userComp,
    userPosition: userPos,
  };

  // Time runs to 1 July (incl. the July development tick).
  const newStart = seasonStart(state.seasonYear + 1);
  passTime(state, data, newStart, news);
  const rng = seasonRngOf(state).fork('transition');
  const leagueCel = leagueCelLookup(state, data);

  // Career archive, exceptional seasons, retirements.
  const pr = balance.development.potentialRaise;
  const retired = new Set<string>();
  for (const p of state.players) {
    if (p.academy) continue;
    const s = state.playerStats[p.id] ?? emptyStats();
    const clubMatches = (() => {
      let n = 0;
      for (const c of state.competitions) for (const r of c.results) if (r.homeId === p.clubId || r.awayId === p.clubId) n++;
      return n;
    })();
    (p.career ??= []).push({
      seasonYear: state.seasonYear,
      clubId: p.clubId,
      competitionId: state.membership[p.clubId] ?? null,
      apps: s.apps,
      goals: s.goals,
      assists: s.assists,
      avgRating: s.apps > 0 ? Math.round((s.ratingSum / s.apps) * 100) / 100 : null,
      cel: overall(p, balance),
      minutesShare: clubMatches > 0 ? Math.min(1, s.minutes / (clubMatches * 90)) : 0,
    });
    const [prev, last] = p.career.slice(-2);
    const exceptional = (c: typeof last) => c !== undefined && c.apps >= pr.minApps && (c.avgRating ?? 0) >= pr.rating;
    if (exceptional(prev) && exceptional(last) && (p.potRaised ?? 0) < pr.cap) {
      const raise = Math.min(rng.int(pr.min, pr.max), pr.cap - (p.potRaised ?? 0));
      p.pot = Math.min(balance.potential.max, p.pot + raise);
      p.potRaised = (p.potRaised ?? 0) + raise;
      if (p.clubId === state.userClubId) news.push({ date: newStart, kind: 'development', playerId: p.id, text: `${nameOf(p)} po dvou výborných sezónách překonává očekávání – potenciál roste.` });
    }
    // Unfulfilled potential fades (design: potential is an expectation, not a ceiling).
    const decay = balance.development.potentialDecay;
    const cel = overall(p, balance);
    if (exactAge(p.birthDate, newStart) >= decay.fromAge && p.pot > cel) p.pot = Math.max(Math.round(cel), Math.round(p.pot - (p.pot - cel) * decay.share));
    const chance = retirementChance(exactAge(p.birthDate, newStart), overall(p, balance), leagueCel(p.clubId), balance);
    if (chance > 0 && rng.fork(p.id).chance(chance)) {
      retired.add(p.id);
      if (p.clubId === state.userClubId) news.push({ date: newStart, kind: 'season', playerId: p.id, text: `${nameOf(p)} (${Math.floor(exactAge(p.birthDate, newStart))}) ukončil kariéru.` });
    }
  }

  // B-teams that left the competitions: young players to the academy of the A-team, the others leave.
  for (const m of movements.filter((x) => x.reason === 'removed')) {
    const club = clubOf(data, m.clubId);
    for (const p of state.players.filter((x) => x.clubId === m.clubId)) {
      if (exactAge(p.birthDate, newStart) < balance.academy.releaseAtAge && club.parentClubId) {
        p.clubId = club.parentClubId;
        p.academy = true;
      } else retired.add(p.id);
    }
  }
  state.players = state.players.filter((p) => !retired.has(p.id));

  // Reset the season state of players.
  for (const p of state.players) {
    p.state.condition = 100;
    if (balance.discipline.resetYellowsAtSeasonEnd) p.state.yellowCards = 0;
  }
  state.history.push(record);
  state.seasonYear++;
  state.date = newStart;
  state.membership = membership;
  state.playerStats = {};
  state.stages = [];
  invalidateRuntime(state);

  // July academy intake and squad management.
  news.push(...academyIntake(state, data, newStart, rng.fork('intake')));
  invalidateRuntime(state);
  news.push(...manageSquads(state, data, { date: newStart, leagueCelOf: leagueCelLookup(state, data), rng: rng.fork('squads') }));
  invalidateRuntime(state);

  state.competitions = buildCompetitions(state, data);
  startCup(state, data);
  state.finished = false;

  if (state.user && state.userClubId) {
    state.user.matches = [];
    // Players who left are removed from the line-up; the assistant fills the gaps before the next match.
    const ids = new Set(state.players.filter((p) => p.clubId === state.userClubId && !p.academy).map((p) => p.id));
    state.user.lineup.playerIds = state.user.lineup.playerIds.map((id) => (id && ids.has(id) ? id : null));
    state.user.lineup.benchIds = state.user.lineup.benchIds.filter((id) => ids.has(id));
    const mv = movements.find((m) => m.clubId === state.userClubId);
    const compName = (id: CompetitionId | null) => data.competitions.find((c) => c.id === id)?.name ?? '';
    news.push({
      date: newStart,
      kind: 'season',
      text: mv
        ? `Začíná sezóna ${state.seasonYear}/${String(state.seasonYear + 1).slice(2)}. Hrajeme ${compName(mv.to)} (${mv.reason === 'relegated' || (mv.reason === 'barrage' && levelOfCompetition(data, mv.to as CompetitionId) > levelOfCompetition(data, mv.from as CompetitionId)) ? 'po sestupu' : 'po postupu'}).`
        : `Začíná sezóna ${state.seasonYear}/${String(state.seasonYear + 1).slice(2)}, hrajeme ${compName(membership[state.userClubId] ?? null)}.`,
    });
  }
  state.news.push(...news);
  if (state.news.length > 80) state.news.splice(0, state.news.length - 80);
  return news;
}
