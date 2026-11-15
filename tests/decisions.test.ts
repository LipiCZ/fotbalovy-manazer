// Rules decided by the user after phase 8: finance as a third board goal, squad limit 30,
// willingness of players to join depends only on sporting success and ambitions.
import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { newGame, playToSeasonEnd, squadOf } from '../src/engine/game/advance.ts';
import { evaluateSeason } from '../src/engine/game/board.ts';
import { clubAttractiveness, personalDemand, refusesClub, signFreeAgent } from '../src/engine/game/market.ts';
import { moveUserPlayer } from '../src/engine/game/userTeam.ts';
import { exactAge } from '../src/engine/game/development.ts';
import { overall } from '../src/engine/players/rating.ts';
import { FREE_AGENT } from '../src/engine/types.ts';

const data = loadDefaultData();

describe('rozhodnutí uživatele po fázi 8', () => {
  it('finance jsou třetí cíl vedení s menší vahou', () => {
    const g = newGame(data, { seed: 'cile', clubId: 'jablonec', managerName: 'T' });
    expect(g.board!.goals.financeLabel).toMatch(/Finance/);
    playToSeasonEnd(g, data);
    const e = evaluateSeason(g, data, false)!;
    expect(e.finance).toBeDefined();
    expect(data.balance.board.weights.finance.success).toBeLessThan(data.balance.board.weights.league.success);
  });

  it('A-tým manažera má limit 30 hráčů', () => {
    const g = newGame(data, { seed: 'limit', clubId: 'jablonec', managerName: 'T' });
    const free = g.players.filter((p) => p.clubId === FREE_AGENT && !p.lowerLeagueOnly);
    let i = 0;
    while (squadOf(g, 'jablonec').length < data.balance.squads.userMax) {
      const p = free[i++]!;
      p.clubId = 'jablonec';
      p.contract = { wage: 1000, until: '2030-06-30' };
      g.players = [...g.players];
    }
    const another = free[i]!;
    const r = signFreeAgent(g, data, another.id, 10_000_000, 2);
    expect(r.message).toMatch(/limit 30/);
    // Moving a reserve or academy player up is blocked too.
    const youth = { ...another, clubId: 'jablonec', academy: true };
    expect(moveUserPlayer(youth, 'A', 'jablonec', g.user!, data, g.membership, exactAge(youth.birthDate, g.date), squadOf(g, 'jablonec').length)).toMatch(/limit/);
  });

  it('ochotu přijít určuje jen úspěch a ambice klubu: neatraktivní klub platí víc a hvězdu nezíská', () => {
    const g = newGame(data, { seed: 'ochota', clubId: 'jablonec', managerName: 'T' });
    const star = [...squadOf(g, 'slavia-praha')].sort((a, b) => overall(b, data.balance) - overall(a, data.balance))[0]!;
    const weak = data.clubs.find((c) => c.competitionId === 'cnl' && !c.parentClubId)!.id;
    const strong = 'sparta-praha';
    expect(clubAttractiveness(g, data, strong)).toBeGreaterThan(clubAttractiveness(g, data, weak));
    // Same competition, different attractiveness: compare two 1st-league clubs.
    const ranked = data.clubs.filter((c) => g.membership[c.id] === 'chance-liga').map((c) => c.id).sort((a, b) => clubAttractiveness(g, data, b) - clubAttractiveness(g, data, a));
    const top = ranked[0]!;
    const bottom = ranked.at(-1)!;
    const wageTop = personalDemand(g, data, star, top).wage;
    const wageBottom = personalDemand(g, data, star, bottom).wage;
    const size = (id: string) => data.clubs.find((c) => c.id === id)!.size;
    if (size(top) === size(bottom)) expect(wageBottom).toBeGreaterThan(wageTop);
    // A star does not join a 3rd-level club at the bottom of its ambitions.
    const third = data.clubs.filter((c) => c.competitionId === 'cfl-a' && !c.parentClubId).map((c) => c.id).sort((a, b) => clubAttractiveness(g, data, a) - clubAttractiveness(g, data, b))[0]!;
    if (clubAttractiveness(g, data, third) < data.balance.transfers.personal.attractiveness.refuseBelow) expect(refusesClub(g, data, star, third)).toBe(true);
  });
});
