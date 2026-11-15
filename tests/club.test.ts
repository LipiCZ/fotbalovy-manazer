import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceToNextUserMatch, newGame, passTime, playToSeasonEnd, squadOf } from '../src/engine/game/advance.ts';
import {
  applyEffects,
  attendanceFactor,
  clubAfterUserMatch,
  clubSeasonStart,
  moraleBonus,
  requestCityDeal,
  requiredStadiumLevel,
  resolveDecision,
  startStadiumProject,
} from '../src/engine/game/club.ts';
import { makeSave, parseSave, serializeSave } from '../src/engine/game/saveFormat.ts';
import type { GameState } from '../src/engine/game/state.ts';
import { startNewSeason } from '../src/engine/game/transition.ts';

const data = loadDefaultData();
const thirdLevelClub = data.clubs.find((c) => c.competitionId === 'cfl-a' && !c.parentClubId)!.id;
const game = (clubId = 'jablonec') => newGame(data, { seed: 'club', clubId, managerName: 'Test' });

describe('klub manažera (fáze 7)', () => {
  it('na začátku: stadion splňuje soutěž, vztahy výchozí, malý klub je spolek', () => {
    const g = game();
    expect(g.club!.stadiumLevel).toBeGreaterThanOrEqual(requiredStadiumLevel(g, data));
    expect(g.club!.relations.fans).toBe(data.balance.club.relations.start.fans);
    expect(g.club!.legalForm).toBe('a.s.');
    expect(game(thirdLevelClub).club!.legalForm).toBe('spolek');
  });

  it('výhra zvedne fanoušky i kabinu, přinese titulek a příspěvky fanoušků', () => {
    const g = game();
    const before = { ...g.club!.relations };
    const news: GameState['news'] = [];
    clubAfterUserMatch(g, data, { date: g.date, homeId: 'jablonec', awayId: 'sparta-praha', homeGoals: 3, awayGoals: 0, label: 'liga' }, news);
    expect(g.club!.relations.fans).toBeGreaterThan(before.fans);
    expect(g.club!.relations.squad).toBeGreaterThan(before.squad);
    expect(news.some((n) => n.kind === 'media')).toBe(true);
    expect(g.club!.social.length).toBe(data.balance.club.socialPerMatch);
  });

  it('nálada kabiny a fanoušci mají malý vliv; pronajatý stadion snižuje návštěvu', () => {
    const g = game();
    g.club!.relations.squad = 100;
    expect(moraleBonus(g, data)).toBeCloseTo(data.balance.club.morale.maxEffect);
    g.club!.relations.squad = 0;
    expect(moraleBonus(g, data)).toBeCloseTo(-data.balance.club.morale.maxEffect);
    g.club!.relations.fans = 50;
    expect(attendanceFactor(g, data)).toBe(1);
    g.club!.rented = true;
    expect(attendanceFactor(g, data)).toBeCloseTo(data.balance.club.stadium.rent.attendanceFactor);
  });

  it('kapitán s vysokým vůdcovstvím tlumí propad nálady', () => {
    const g = game();
    const cap = g.players.find((p) => p.id === g.user!.tactics.captainId)!;
    cap.leadership = 90;
    g.club!.relations.squad = 50;
    applyEffects(g, data, { squad: -4 }, g.date);
    expect(g.club!.relations.squad).toBeCloseTo(50 - 4 * (1 - data.balance.captain.moraleDropDamping));
  });

  it('stavba stadionu: měsíční platby, po dokončení vyšší úroveň a kapacita', () => {
    const g = game(thirdLevelClub);
    const f = g.finances[thirdLevelClub]!;
    f.cash += 50_000_000;
    const level = g.club!.stadiumLevel;
    expect(startStadiumProject(g, data, false)).toMatch(/Stavba začala/);
    const months = data.balance.club.stadium.levels[level]!.months;
    passTime(g, data, `${g.seasonYear + (months >= 6 ? 1 : 0)}-${String(((6 + months) % 12) + 1).padStart(2, '0')}-02`, []);
    expect(g.club!.stadiumLevel).toBe(level + 1);
    expect(f.capacity).toBeGreaterThanOrEqual(data.balance.club.stadium.levels[level]!.capacity);
    expect(f.season.investment ?? 0).toBeLessThan(0);
  });

  it('dohoda s městem: nabídka, přijetí spustí stavbu s podílem města', () => {
    const g = game(thirdLevelClub);
    g.finances[thirdLevelClub]!.cash += 50_000_000;
    g.club!.relations.city = 80;
    requestCityDeal(g, data);
    const d = g.club!.decisions.find((x) => x.kind === 'cityDeal')!;
    expect(d).toBeDefined();
    resolveDecision(g, data, d.id, 0);
    expect(g.club!.project?.cityShare).toBeGreaterThan(0);
    expect(g.club!.cityDeal?.status).toBe('active');
  });

  it('postup bez stadionu: pronájem; bez stavby další sezónu odečet bodů; investor pro spolek', () => {
    const g = game(thirdLevelClub);
    g.club!.stadiumLevel = 2;
    // Pretend promotion to the 2nd league.
    g.membership[thirdLevelClub] = 'cnl';
    clubSeasonStart(g, data, { clubId: thirdLevelClub, from: 'cfl-a', to: 'cnl', reason: 'promoted' }, []);
    expect(g.club!.rented).toBe(true);
    const inv = g.club!.decisions.find((x) => x.kind === 'investor');
    expect(inv).toBeDefined();
    const cash = g.finances[thirdLevelClub]!.cash;
    resolveDecision(g, data, inv!.id, 0);
    expect(g.club!.legalForm).toBe('a.s.');
    expect(g.finances[thirdLevelClub]!.cash).toBeGreaterThan(cash);
    const before = g.finances[thirdLevelClub]!.pointDeduction;
    clubSeasonStart(g, data, undefined, []);
    expect(g.finances[thirdLevelClub]!.pointDeduction).toBe(before + data.balance.club.stadium.licencePointsIfNotStarted);
  });

  it('události: vypnuto = žádné, často = několik za sezónu', () => {
    const off = game();
    off.club!.events = 'vypnuto';
    const on = game();
    on.club!.events = 'často';
    for (const g of [off, on]) passTime(g, data, `${g.seasonYear + 1}-06-01`, []);
    const count = (g: GameState) => g.transactions.filter((t) => (t.type === 'otherIncome' || t.type === 'otherCost') && t.note !== '').length + g.club!.decisions.filter((d) => d.kind === 'event').length;
    expect(count(off)).toBe(0);
    expect(count(on)).toBeGreaterThan(2);
  });

  it('ohlášená poslední sezóna: hráč po sezóně skončí, přemluvený zůstane', () => {
    const g = game();
    const [a, b] = squadOf(g, 'jablonec');
    a!.lastSeason = { announced: g.date };
    b!.lastSeason = { announced: g.date, persuaded: true };
    playToSeasonEnd(g, data);
    startNewSeason(g, data);
    expect(g.players.some((p) => p.id === a!.id)).toBe(false);
    const stayed = g.players.find((p) => p.id === b!.id);
    if (stayed) expect(stayed.lastSeason).toBeUndefined();
  });

  it('uložení verze 5 a převod z verze 4', () => {
    const g = game();
    advanceToNextUserMatch(g, data);
    const text = serializeSave(makeSave(g, data, 'x', '2026-01-01'));
    expect(parseSave(text, data).save.game.club?.relations).toEqual(g.club!.relations);
    const old = JSON.parse(text);
    old.version = 4;
    delete old.game.club;
    const migrated = parseSave(old, data);
    expect(migrated.save.game.club).not.toBeNull();
    expect(migrated.warnings.some((w) => w.includes('klubem'))).toBe(true);
  });
});
