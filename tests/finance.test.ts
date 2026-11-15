import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { advanceToNextUserMatch, newGame, playToSeasonEnd } from '../src/engine/game/advance.ts';
import { boardGoals, evaluateSeason, wouldBeSacked } from '../src/engine/game/board.ts';
import { leaguePrize, maxLoan, repayLoan, setTicketPrice, statements, takeLoan, TX, wageFor } from '../src/engine/game/finance.ts';
import { makeSave, parseSave, serializeSave } from '../src/engine/game/saveFormat.ts';
import { startNewSeason } from '../src/engine/game/transition.ts';

const data = loadDefaultData();
const { balance } = data;
const game = () => newGame(data, { seed: 'finance', clubId: 'jablonec', managerName: 'Test' });

describe('ekonomika (design, sekce 13)', () => {
  it('na začátku: finance všech klubů, smlouvy všech hráčů, rozpočet a cíle vedení', () => {
    const g = game();
    expect(Object.keys(g.finances)).toHaveLength(data.clubs.length);
    expect(g.players.every((p) => p.contract && p.contract.wage > 0 && p.contract.until.endsWith('-06-30'))).toBe(true);
    expect(g.board?.goals.leaguePosition).toBeGreaterThan(0);
    expect(g.board?.budget.wageCap).toBeGreaterThan(0);
    const f = g.finances['jablonec']!;
    expect(f.cash).toBeGreaterThan(0);
    expect(f.capacity).toBeGreaterThan(0);
  });

  it('plat roste s kvalitou a velikostí klubu', () => {
    const g = game();
    const p = g.players.find((x) => x.clubId === 'jablonec' && !x.academy)!;
    expect(wageFor(p, 1, false, 5, balance)).toBeGreaterThan(wageFor(p, 1, false, 3, balance));
    expect(wageFor(p, 1, false, 3, balance)).toBeGreaterThan(wageFor(p, 2, false, 3, balance));
  });

  it('domácí zápas přinese vstupné a návštěvu do kapacity; každá transakce je v sezónních součtech', () => {
    const g = game();
    for (let i = 0; i < 4; i++) advanceToNextUserMatch(g, data);
    const f = g.finances['jablonec']!;
    expect(f.season.tickets ?? 0).toBeGreaterThan(0);
    const homeResults = g.competitions[0]!.results.filter((r) => r.homeId === 'jablonec');
    for (const r of homeResults) {
      expect(r.attendance).toBeGreaterThan(0);
      expect(r.attendance!).toBeLessThanOrEqual(r.capacity!);
    }
    const sums: Record<string, number> = {};
    for (const t of g.transactions) sums[t.type] = (sums[t.type] ?? 0) + t.amount;
    for (const [type, v] of Object.entries(f.season)) expect(sums[type], type).toBeCloseTo(v, 0);
  });

  it('peníze = počáteční stav + všechny peněžní pohyby', () => {
    const g = game();
    const cashMovesSoFar = (f: typeof g.finances[string]) =>
      Object.entries(f.season).filter(([t]) => TX[t as keyof typeof TX].cash).reduce((s, [, v]) => s + v, 0);
    // Money already booked at creation (e.g. the prize for entering the 1st cup round) belongs to the season.
    const start = g.finances['jablonec']!.cash - cashMovesSoFar(g.finances['jablonec']!);
    playToSeasonEnd(g, data);
    const f = g.finances['jablonec']!;
    const cashMoves = Object.entries(f.season).filter(([t]) => TX[t as keyof typeof TX].cash).reduce((s, [, v]) => s + v, 0);
    expect(f.cash).toBeCloseTo(start + cashMoves, 0);
  });

  it('rozvaha: vlastní kapitál = aktiva − závazky; výsledek = výnosy + náklady', () => {
    const g = game();
    for (let i = 0; i < 5; i++) advanceToNextUserMatch(g, data);
    const st = statements(g.finances['jablonec']!);
    expect(st.equity).toBeCloseTo(st.assets.stadium + st.assets.registrations + st.assets.cash - st.liabilities.loans - st.liabilities.overdue, 0);
    expect(st.result).toBeCloseTo([...st.revenues, ...st.costs].reduce((s, [, v]) => s + v, 0), 0);
  });

  it('vstupné jde nastavit jen před prvním domácím zápasem a v mezích', () => {
    const g = game();
    expect(setTicketPrice(g, data, 99999)).toBeNull();
    expect(g.finances['jablonec']!.ticketPrice).toBe(balance.economy.ticketPrice.reference['1'] * balance.economy.ticketPrice.maxFactor);
    playToSeasonEnd(g, data);
    expect(setTicketPrice(g, data, 200)).toMatch(/jednou za sezónu/);
  });

  it('úvěr: nejvýš limit, úroky, splátka', () => {
    const g = game();
    const f = g.finances['jablonec']!;
    const max = maxLoan(f, balance);
    expect(takeLoan(g, data, max + 1)).toMatch(/nejvýš/);
    expect(takeLoan(g, data, 1_000_000)).toBeNull();
    expect(f.loans).toBe(1_000_000);
    advanceToNextUserMatch(g, data);
    advanceToNextUserMatch(g, data);
    expect(f.season.interest ?? 0).toBeLessThan(0);
    expect(repayLoan(g, 1_000_000)).toBeNull();
    expect(f.loans).toBe(0);
  });

  it('odměna za umístění klesá od 1. místa', () => {
    expect(leaguePrize(1, 1, 16, balance)).toBeGreaterThan(leaguePrize(1, 16, 16, balance));
    expect(leaguePrize(1, 1, 16, balance)).toBe(balance.economy.prizeMoney.league['1'][0]);
  });

  it('licence: záporné peníze k 31. 5. znamenají odpočet bodů v příští sezóně', () => {
    const g = game();
    g.finances['jablonec']!.cash = -500_000_000;
    playToSeasonEnd(g, data);
    expect(g.finances['jablonec']!.pendingDeduction).toBe(balance.economy.license.pointDeduction);
    startNewSeason(g, data);
    expect(g.finances['jablonec']!.pointDeduction).toBe(balance.economy.license.pointDeduction);
  });
});

describe('vedení: cíle a hodnocení (design, sekce 10 a 14)', () => {
  it('silnější tým má vyšší cíl', () => {
    const slavia = newGame(data, { seed: 'cile', clubId: 'slavia-praha', managerName: 'T' });
    const artis = newGame(data, { seed: 'cile', clubId: 'artis-brno', managerName: 'T' });
    expect(boardGoals(slavia, data)!.leaguePosition).toBeLessThan(boardGoals(artis, data)!.leaguePosition);
  });

  it('hodnocení sezóny: 5 stupňů, uloží se do historie', () => {
    const g = game();
    playToSeasonEnd(g, data);
    const e = evaluateSeason(g, data, false)!;
    expect(['vynikající', 'úspěšná', 'přijatelná', 'neúspěšná', 'katastrofa']).toContain(e.overall);
    startNewSeason(g, data);
    expect(g.history[0]!.evaluation).toBeDefined();
    expect(g.board!.grades).toHaveLength(1);
    expect(g.history[0]!.finance!.season.tickets).toBeGreaterThan(0);
  });

  it('vyhazov: katastrofa, nebo dvě neúspěšné sezóny za sebou', () => {
    expect(wouldBeSacked(['katastrofa'], data)).toBe(true);
    expect(wouldBeSacked(['neúspěšná'], data)).toBe(false);
    expect(wouldBeSacked(['neúspěšná', 'neúspěšná'], data)).toBe(true);
    expect(wouldBeSacked(['neúspěšná', 'přijatelná'], data)).toBe(false);
  });
});

describe('ukládání verze 3', () => {
  it('uložení z verze 2 se převede (finance, smlouvy, cíle)', () => {
    const g = game();
    const save = structuredClone(makeSave(g, data, 'x', 'now')) as unknown as { version: number; game: Record<string, unknown> };
    save.version = 2;
    delete save.game.finances;
    delete save.game.transactions;
    delete save.game.board;
    for (const p of save.game.players as { contract?: unknown }[]) delete p.contract;
    const { save: migrated, warnings } = parseSave(save, data);
    expect(warnings.join(' ')).toMatch(/ekonomikou/);
    expect(migrated.game.finances['jablonec']).toBeDefined();
    expect(migrated.game.players.every((p) => p.contract)).toBe(true);
    advanceToNextUserMatch(migrated.game, data);
  });

  it('uložení a načtení s financemi pokračuje stejně', () => {
    const a = game();
    for (let i = 0; i < 3; i++) advanceToNextUserMatch(a, data);
    const b = parseSave(serializeSave(makeSave(a, data, 'x', 'now')), data).save.game;
    for (let i = 0; i < 3; i++) {
      advanceToNextUserMatch(a, data);
      advanceToNextUserMatch(b, data);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
