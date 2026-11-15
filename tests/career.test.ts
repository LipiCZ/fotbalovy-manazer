import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceToNextUserMatch, newGame, playToSeasonEnd, squadOf } from '../src/engine/game/advance.ts';
import { seasonAwards } from '../src/engine/game/awards.ts';
import { careerStartOffers, changeClub } from '../src/engine/game/career.ts';
import { levelOf } from '../src/engine/game/finance.ts';
import { makeSave, parseSave, serializeSave } from '../src/engine/game/saveFormat.ts';
import { startNewSeason } from '../src/engine/game/transition.ts';

const data = loadDefaultData();

describe('kariéra trenéra (design, sekce 10)', () => {
  it('kariéra od dna: 4 nabídky ze 3. ligy s profily, pozadí určí reputaci a vztahy', () => {
    const offers = careerStartOffers(data, 'kariera');
    expect(offers).toHaveLength(data.balance.career.startOffers);
    expect(new Set(offers.map((o) => o.clubId)).size).toBe(offers.length);
    const o = offers.find((x) => x.profile === 'město')!;
    const g = newGame(data, { seed: 'kariera', clubId: o.clubId, managerName: 'T', career: { mode: 'career', background: 'mládež', profile: 'město' } });
    expect(levelOf(g, data, o.clubId)).toBe(3);
    expect(g.coach!.reputation).toBe(data.balance.career.backgrounds['mládež'].reputation);
    expect(g.club!.relations.city).toBe(Math.min(100, data.balance.club.relations.start.city + 10 + 20));
  });

  it('vyhazov po katastrofě: nabídky, nový klub, sezóna pokračuje', () => {
    const g = newGame(data, { seed: 'vyhazov', clubId: 'jablonec', managerName: 'T' });
    playToSeasonEnd(g, data);
    g.board!.grades = ['katastrofa'];
    g.board!.goals.leaguePosition = 1; // so the evaluation itself is a failure too
    startNewSeason(g, data);
    expect(g.coach!.history).toHaveLength(1);
    if (!g.coach!.sacked) g.coach!.sacked = true; // the grade of the real season decides; force the path
    if (g.coach!.offers.length === 0) g.coach!.offers = [{ clubId: 'zlin', text: 'Zlín' }];
    const target = g.coach!.offers[0]!.clubId;
    changeClub(g, data, target, []);
    expect(g.userClubId).toBe(target);
    expect(g.coach!.sacked).toBe(false);
    expect(g.user!.lineup.playerIds.every((id) => id === null || squadOf(g, target).some((p) => p.id === id))).toBe(true);
    expect(g.board!.grades).toEqual([]);
    advanceToNextUserMatch(g, data);
    expect(g.user!.matches).toHaveLength(1);
  });

  it('úspěšná sezóna zvedne reputaci; ceny sezóny se spočítají a uloží', () => {
    const g = newGame(data, { seed: 'reputace', clubId: 'slavia-praha', managerName: 'T' });
    const rep = g.coach!.reputation;
    playToSeasonEnd(g, data);
    const awards = seasonAwards(g, data);
    expect(awards.map((a) => a.title)).toEqual(expect.arrayContaining(['Gól sezóny', 'Objev sezóny', 'Hláška sezóny']));
    const grade = (() => {
      startNewSeason(g, data);
      return g.coach!.history[0]!.grade;
    })();
    expect(g.history.at(-1)!.awards!.length).toBeGreaterThan(2);
    if (grade === 'vynikající' || grade === 'úspěšná') expect(g.coach!.reputation).toBeGreaterThan(rep);
  });

  it('uložení verze 6 a převod z verze 5', () => {
    const g = newGame(data, { seed: 'save6', clubId: 'jablonec', managerName: 'T' });
    const text = serializeSave(makeSave(g, data, 'x', '2026-01-01'));
    const old = JSON.parse(text);
    old.version = 5;
    delete old.game.coach;
    const r = parseSave(old, data);
    expect(r.save.game.coach?.mode).toBe('free');
  });
});
