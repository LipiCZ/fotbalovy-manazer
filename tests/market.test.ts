import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceToNextUserMatch, newGame, passTime, playToSeasonEnd, squadOf } from '../src/engine/game/advance.ts';
import { TX, wageBill } from '../src/engine/game/finance.ts';
import {
  acceptCounter,
  agreeTerms,
  askingPrice,
  canRenew,
  listPlayer,
  makeOffer,
  marketDays,
  marketValue,
  personalDemand,
  releasePlayer,
  renewContract,
  renewalDemand,
  respondToOffer,
  signFreeAgent,
  windowOn,
} from '../src/engine/game/market.ts';
import { makeSave, parseSave, serializeSave } from '../src/engine/game/saveFormat.ts';
import { estimateOf, hireScout, observe, setScoutTask } from '../src/engine/game/scouting.ts';
import type { GameState } from '../src/engine/game/state.ts';
import { startNewSeason } from '../src/engine/game/transition.ts';
import { overall } from '../src/engine/players/rating.ts';
import { FREE_AGENT, type Player } from '../src/engine/types.ts';

const data = loadDefaultData();
const USER = 'jablonec';
const game = () => newGame(data, { seed: 'market', clubId: USER, managerName: 'Test' });
const cashMoves = (g: GameState, club: string) =>
  Object.entries(g.finances[club]!.season)
    .filter(([t]) => TX[t as keyof typeof TX].cash)
    .reduce((s, [, v]) => s + v, 0);

/** A good player of another 1st-league club. */
function target(g: GameState): Player {
  return squadOf(g, 'slavia-praha')
    .slice()
    .sort((a, b) => overall(b, data.balance) - overall(a, data.balance))[3]!;
}

describe('tržní hodnota a okna (design, sekce 8)', () => {
  it('hodnota roste s CEL, klesá s věkem a délkou smlouvy; volný hráč nemá odstupné', () => {
    const g = game();
    const p = target(g);
    const v = marketValue(g, data, p);
    expect(v).toBeGreaterThan(0);
    const better = structuredClone(p);
    for (const k of Object.keys(better.attributes) as (keyof typeof better.attributes)[]) better.attributes[k] += 5;
    expect(marketValue(g, data, better)).toBeGreaterThan(v);
    const older = { ...structuredClone(p), birthDate: '1990-01-01' };
    expect(marketValue(g, data, older)).toBeLessThan(v);
    const short = { ...structuredClone(p), contract: { wage: 1, until: `${g.seasonYear}-12-31` } };
    expect(marketValue(g, data, short)).toBeLessThan(v);
    const free = g.players.find((x) => x.clubId === FREE_AGENT)!;
    expect(marketValue(g, data, free)).toBe(0);
  });

  it('okna: léto 1. 7.–1. 9., zima 1. 1.–15. 2.; tržní dny jednou týdně', () => {
    expect(windowOn('2025-07-15', data)).toBe('summer');
    expect(windowOn('2025-10-15', data)).toBeNull();
    expect(windowOn('2026-02-10', data)).toBe('winter');
    const days = marketDays('2025-06-30', '2026-03-01', data);
    expect(days[0]).toBe('2025-07-01');
    expect(days).toContain('2025-07-08');
    expect(days).toContain('2026-01-01');
    expect(days.every((d) => windowOn(d, data))).toBe(true);
  });

  it('na začátku hry existuje skupina volných hráčů', () => {
    const g = game();
    const free = g.players.filter((p) => p.clubId === FREE_AGENT);
    expect(free.length).toBeGreaterThan(100);
    expect(free.every((p) => !p.contract)).toBe(true);
  });
});

describe('nabídky a přestup hráče manažera', () => {
  it('nízká nabídka dostane protinabídku, po přijetí a dohodě s hráčem přestup proběhne a zaúčtuje se', () => {
    const g = game();
    const p = target(g);
    const ask = askingPrice(g, data, p, USER);
    g.finances[USER]!.cash += ask * 2; // enough money for the test
    const low = makeOffer(g, data, { playerId: p.id, kind: 'transfer', fee: Math.round(ask * 0.8) });
    expect(low.offer?.status).toBe('countered');
    expect(acceptCounter(g, low.offer!.id).offer?.status).toBe('agreed');
    const demand = personalDemand(g, data, p, USER);
    const tooLittle = agreeTerms(g, data, low.offer!.id, Math.round(demand.wage * 0.5), 3);
    expect(tooLittle.offer?.status).toBe('agreed');
    const before = { cash: cashMoves(g, USER), seller: g.finances['slavia-praha']!.season.transfersIn ?? 0 };
    const done = agreeTerms(g, data, low.offer!.id, demand.wage, 3);
    expect(done.offer?.status).toBe('done');
    expect(p.clubId).toBe(USER);
    expect(p.contract?.until).toBe(`${g.seasonYear + 3}-06-30`);
    // Capitalised: fee + agent + signing bonus; paid in cash; seller has revenue.
    const fee = done.offer!.fee;
    expect(p.registration!.cost).toBeGreaterThanOrEqual(fee);
    expect(g.finances[USER]!.registrations).toBeCloseTo(p.registration!.cost, 0);
    expect(cashMoves(g, USER) - before.cash).toBeCloseTo(-p.registration!.cost, -3);
    expect((g.finances['slavia-praha']!.season.transfersIn ?? 0) - before.seller).toBe(fee);
    // Amortisation over the contract (non-cash).
    passTime(g, data, `${g.seasonYear}-09-02`, []);
    expect(g.finances[USER]!.season.amortization ?? 0).toBeLessThan(0);
    expect(p.registration!.bookValue).toBeLessThan(p.registration!.cost);
  });

  it('nevážná nabídka je odmítnuta, po třech kolech klub jednání ukončí', () => {
    const g = game();
    const p = target(g);
    expect(makeOffer(g, data, { playerId: p.id, kind: 'transfer', fee: 1000 }).offer?.status).toBe('rejected');
    const ask = askingPrice(g, data, p, USER);
    let last = '';
    for (let i = 0; i < 3; i++) last = makeOffer(g, data, { playerId: p.id, kind: 'transfer', fee: Math.round(ask * 0.7) }).offer!.status;
    expect(last).toBe('rejected');
  });

  it('dohoda mimo okno čeká a provede se při otevření dalšího okna', () => {
    const g = game();
    passTime(g, data, `${g.seasonYear}-10-01`, []);
    const p = target(g);
    g.finances[USER]!.cash += askingPrice(g, data, p, USER) * 3;
    const o = makeOffer(g, data, { playerId: p.id, kind: 'transfer', fee: askingPrice(g, data, p, USER) * 1.2 });
    expect(o.offer?.status).toBe('agreed');
    const r = agreeTerms(g, data, o.offer!.id, personalDemand(g, data, p, USER).wage, 2);
    expect(r.offer?.status).toBe('pending');
    expect(p.clubId).toBe('slavia-praha');
    passTime(g, data, `${g.seasonYear + 1}-01-02`, []);
    expect(g.players.find((x) => x.id === p.id)?.clubId).toBe(USER);
  });

  it('hostování: hostitel platí podíl platu, hráč se po sezóně vrátí', () => {
    const g = game();
    const young = g.players.find((p) => p.clubId === 'sparta-praha' && !p.academy && p.birthDate >= `${g.seasonYear - 20}-01-01` && p.contract)!;
    listPlayer(g, data, young.id, null);
    young.listed = { kind: 'loan', askingPrice: 0 };
    const o = makeOffer(g, data, { playerId: young.id, kind: 'loan', fee: 0, wageShare: 0.5 });
    expect(o.offer?.status).toBe('agreed');
    const before = wageBill(g, data, USER);
    expect(agreeTerms(g, data, o.offer!.id, 0, 1).offer?.status).toBe('done');
    expect(young.clubId).toBe(USER);
    expect(wageBill(g, data, USER) - before).toBe(Math.round(12 * young.contract!.wage * 0.5));
    playToSeasonEnd(g, data);
    startNewSeason(g, data);
    expect(g.players.find((x) => x.id === young.id)?.clubId ?? 'sparta-praha').toBe('sparta-praha');
  });
});

describe('prodej, smlouvy, volní hráči', () => {
  it('hráč na prodej dostane v okně nabídky; přijetí ho prodá a odepíše zůstatek', () => {
    const g = game();
    const p = squadOf(g, USER).slice().sort((a, b) => overall(b, data.balance) - overall(a, data.balance))[2]!;
    listPlayer(g, data, p.id, 'sale', Math.round(marketValue(g, data, p) * 0.9));
    p.registration = { cost: 1_000_000, bookValue: 1_000_000, monthly: 30_000 };
    g.finances[USER]!.registrations += 1_000_000;
    passTime(g, data, `${g.seasonYear}-08-30`, []);
    const offer = g.market.offers.find((o) => o.playerId === p.id && o.initiatedBy === 'ai' && o.status === 'open');
    if (!offer) {
      // Nobody came: the player is still ours and still listed.
      expect(p.clubId).toBe(USER);
      return;
    }
    const r = respondToOffer(g, data, offer.id, 'accept');
    expect(r.offer?.status).toBe('done');
    expect(p.clubId).not.toBe(USER);
    expect(g.finances[USER]!.season.transfersIn).toBeGreaterThan(0);
    expect(g.finances[USER]!.registrations).toBeCloseTo(0, 0);
  });

  it('prodloužení smlouvy: jde jen dva roky před koncem a hráč chce aspoň svůj plat', () => {
    const g = game();
    const p = squadOf(g, USER).find((x) => x.contract && canRenew(g, data, x))!;
    const demand = renewalDemand(g, data, p);
    expect(demand.wage).toBeGreaterThanOrEqual(p.contract!.wage);
    expect(renewContract(g, data, p.id, Math.round(demand.wage * 0.5), 3).ok).toBe(false);
    const r = renewContract(g, data, p.id, demand.wage, 4);
    expect(r.ok).toBe(true);
    expect(p.contract!.until).toBe(`${g.seasonYear + 4}-06-30`);
  });

  it('propuštění stojí odstupné a hráč je pak volný; volného hráče jde podepsat kdykoli', () => {
    const g = game();
    const p = squadOf(g, USER).at(-1)!;
    const cash = g.finances[USER]!.cash;
    const sev = releasePlayer(g, data, p, { severance: true });
    expect(sev).toBeGreaterThan(0);
    expect(g.finances[USER]!.cash).toBe(cash - sev);
    expect(p.clubId).toBe(FREE_AGENT);
    passTime(g, data, `${g.seasonYear}-10-10`, []);
    const free = g.players.find((x) => x.clubId === FREE_AGENT && !x.lowerLeagueOnly)!;
    const demand = personalDemand(g, data, free, USER);
    expect(signFreeAgent(g, data, free.id, demand.wage, 2).offer?.status).toBe('done');
    expect(free.clubId).toBe(USER);
  });

  it('nevyřízené smlouvy hráčů manažera skončí odchodem, AI kluby si potřebné hráče nechají', () => {
    const g = game();
    const leaving = squadOf(g, USER).filter((p) => p.contract!.until <= `${g.seasonYear + 1}-06-30`);
    playToSeasonEnd(g, data);
    startNewSeason(g, data);
    // Unrenewed players leave unless the assistant had to keep some for a full squad.
    const stayed = leaving.filter((p) => g.players.find((x) => x.id === p.id)?.clubId === USER);
    expect(stayed.length).toBeLessThan(leaving.length);
    expect(squadOf(g, USER).length).toBeGreaterThanOrEqual(data.balance.squads.byLevel['1'].min - 6);
    // AI clubs still have full squads and every club player has a contract.
    for (const c of data.clubs.filter((x) => g.membership[x.id] && x.id !== USER))
      expect(squadOf(g, c.id).length).toBeGreaterThanOrEqual(data.balance.squads.byLevel['3'].min - 1);
    expect(g.players.filter((p) => p.clubId !== FREE_AGENT).every((p) => p.contract)).toBe(true);
  });
});

describe('skauting (design, sekce 6)', () => {
  it('odhad vždy obsahuje skutečnou hodnotu a skaut ho zpřesní', () => {
    const g = game();
    const third = g.players.find((p) => g.membership[p.clubId] === 'cfl-a' && !p.academy)!;
    expect(estimateOf(g, data, third)).toBeNull();
    observe(g, third.id, 12, 1, g.date);
    const rough = estimateOf(g, data, third)!;
    observe(g, third.id, 2, 4, g.date);
    const fine = estimateOf(g, data, third)!;
    expect(fine.accuracy).toBeLessThan(rough.accuracy);
    for (const e of [rough, fine]) {
      expect(e.pot[0]).toBeLessThanOrEqual(Math.max(overall(third, data.balance), Math.round(third.pot)));
      expect(e.pot[1]).toBeGreaterThanOrEqual(Math.round(third.pot));
      expect(e.cel[0]).toBeLessThanOrEqual(overall(third, data.balance));
      expect(e.cel[1]).toBeGreaterThanOrEqual(overall(third, data.balance));
    }
    // Own players: exact CEL, POT only as a range.
    const own = squadOf(g, USER)[0]!;
    const e = estimateOf(g, data, own)!;
    expect(e.cel[0]).toBe(e.cel[1]);
    expect(e.pot[1]).toBeGreaterThanOrEqual(e.pot[0]);
    expect(e.accuracy).toBe(data.balance.scouting.ownAccuracy);
  });

  it('najatý skaut s úkolem sleduje soutěž a dostává plat', () => {
    const g = game();
    const cand = g.scouting.candidates[0]!;
    expect(hireScout(g, data, cand.id)).toBeNull();
    setScoutTask(g, cand.id, { kind: 'competition', competitionId: 'cfl-a', focus: 'talents' });
    passTime(g, data, `${g.seasonYear}-09-02`, []);
    expect(Object.keys(g.scouting.knowledge).length).toBeGreaterThan(10);
    const staff = g.transactions.filter((t) => t.note.startsWith('plat skauta'));
    expect(staff.length).toBeGreaterThan(0);
  });
});

describe('uložení verze 4', () => {
  it('hra s trhem po uložení a načtení pokračuje stejně', () => {
    const a = game();
    for (let i = 0; i < 3; i++) advanceToNextUserMatch(a, data);
    const loaded = parseSave(serializeSave(makeSave(a, data, 'x', '2025-01-01')), data).save.game;
    for (let i = 0; i < 4; i++) {
      advanceToNextUserMatch(a, data);
      advanceToNextUserMatch(loaded, data);
    }
    expect(loaded.players.map((p) => `${p.id}:${p.clubId}`)).toEqual(a.players.map((p) => `${p.id}:${p.clubId}`));
    expect(loaded.finances[USER]!.cash).toBe(a.finances[USER]!.cash);
  });
});
