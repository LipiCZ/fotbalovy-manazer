import { describe, expect, it } from 'vitest';
import { loadDefaultData, type Balance } from '../src/engine/data.ts';
import { createGameState } from '../src/engine/game/advance.ts';
import {
  academyIntake,
  applyGrowth,
  exactAge,
  formMultiplierFor,
  minutesMultiplier,
  monthlyGrowth,
  retirementChance,
  type GrowthInput,
} from '../src/engine/game/development.ts';
import { generateAttributes } from '../src/engine/players/generate.ts';
import { celAt, fsAt, tsAt } from '../src/engine/players/rating.ts';
import { Rng } from '../src/engine/rng.ts';
import type { Player } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const { balance } = data;
const base: GrowthInput = { age: 18, cel: 50, pot: 75, minutesShare: 1, leagueCel: 53, formRating: 6.5, training: 'normal', professionalism: 50, confident: true };

describe('násobiče růstu (design, sekce 5)', () => {
  it('forma přesně podle tabulky', () => {
    expect(formMultiplierFor(7.6, balance)).toBe(1.6);
    expect(formMultiplierFor(7.0, balance)).toBe(1.2);
    expect(formMultiplierFor(6.5, balance)).toBe(1.0);
    expect(formMultiplierFor(6.0, balance)).toBe(0.6);
    expect(formMultiplierFor(5.5, balance)).toBe(0.3);
    expect(formMultiplierFor(null, balance)).toBe(1);
  });

  it('minuty: lavička skoro nic, nejlépe soutěž mírně nad hráčem', () => {
    expect(minutesMultiplier(0, 50, 53, balance)).toBeCloseTo(balance.development.minutes.bench);
    expect(minutesMultiplier(0.4, 50, 53, balance)).toBeGreaterThan(0.5); // střídající hráč roste
    const optimal = minutesMultiplier(1, 50, 53, balance);
    expect(optimal).toBeCloseTo(1);
    expect(minutesMultiplier(1, 60, 50, balance)).toBeLessThan(optimal - 0.2); // soutěž je pro něj slabá
    expect(minutesMultiplier(1, 45, 60, balance)).toBeLessThan(optimal - 0.2); // soutěž je pro něj moc silná
  });

  it('mladí rostou nejrychleji, ve 27–31 skoro stagnace, od 32 pokles', () => {
    const g = (age: number) => monthlyGrowth({ ...base, age, pot: 90 }, balance);
    expect(g(18)).toBeGreaterThan(g(23));
    expect(g(23)).toBeGreaterThan(g(29));
    expect(g(29)).toBeGreaterThanOrEqual(0);
    expect(g(34)).toBeLessThan(0);
    expect(g(36)).toBeLessThan(g(34));
  });

  it('bez sebevědomí a u potenciálu se nerůstá; tvrdý trénink a profesionalita pomáhají', () => {
    expect(monthlyGrowth({ ...base, confident: false }, balance)).toBe(0);
    expect(monthlyGrowth({ ...base, cel: 75, pot: 75 }, balance)).toBe(0);
    expect(monthlyGrowth({ ...base, training: 'hard' }, balance)).toBeGreaterThan(monthlyGrowth(base, balance));
    expect(monthlyGrowth({ ...base, professionalism: 90 }, balance)).toBeGreaterThan(monthlyGrowth({ ...base, professionalism: 20 }, balance));
  });
});

describe('rozdělení růstu do atributů', () => {
  const quiet: Balance = structuredClone(balance);
  quiet.development.attributeNoise = 0;
  const make = (): Player =>
    ({ positions: ['ST'], attributes: generateAttributes('ST', 55, 55, balance, new Rng('a')), leadership: 40, hidden: {} } as unknown as Player);

  it('růst o 1 zvedne CEL zhruba o 1', () => {
    const p = make();
    const before = celAt(p, 'ST', balance);
    applyGrowth(p, 1, 20, quiet, new Rng(1));
    expect(celAt(p, 'ST', balance) - before).toBeCloseTo(1, 0);
  });

  it('mladík roste víc fyzicky, pokles po 32 letech jde hlavně do FS', () => {
    const young = make();
    const [ts0, fs0] = [tsAt(young, 'ST', balance), fsAt(young, 'ST', balance)];
    applyGrowth(young, 2, 19, quiet, new Rng(1));
    expect(fsAt(young, 'ST', balance) - fs0).toBeGreaterThan(tsAt(young, 'ST', balance) - ts0);
    const old = make();
    const [ts1, fs1] = [tsAt(old, 'ST', balance), fsAt(old, 'ST', balance)];
    applyGrowth(old, -2, 34, quiet, new Rng(1));
    expect(fs1 - fsAt(old, 'ST', balance)).toBeGreaterThan(3 * (ts1 - tsAt(old, 'ST', balance)));
  });
});

describe('scénář talentu ze sekce 5', () => {
  // 17 let, CEL 46, POT 76: B-tým (3. liga), pak 2. liga, pak střídající hráč v 1. lize, pak základ.
  const path = [
    { leagueCel: 50, share: 0.85 },
    { leagueCel: 57, share: 0.8 },
    { leagueCel: 66, share: 0.4 },
    { leagueCel: 66, share: 0.85 },
  ];
  const simulate = (formRating: number) => {
    let cel = 46;
    for (let year = 0; year < 4; year++)
      for (let m = 0; m < 12; m++)
        cel += monthlyGrowth({ ...base, age: 17 + year + m / 12, cel, pot: 76, minutesShare: path[year]!.share, leagueCel: path[year]!.leagueCel, formRating }, balance);
    return cel;
  };
  it('s průměrnou formou má ve 21 letech CEL kolem 70–72', () => {
    const cel = simulate(6.5);
    expect(cel).toBeGreaterThanOrEqual(68.5);
    expect(cel).toBeLessThanOrEqual(73.5);
  });
  it('s nadprůměrnou formou víc: 6,8–7,4 kolem 72, s formou 7,5+ dosáhne 75+ (u POT 76)', () => {
    expect(simulate(7.0)).toBeGreaterThanOrEqual(71.5);
    expect(simulate(7.5)).toBeGreaterThanOrEqual(75);
    expect(simulate(7.5)).toBeLessThanOrEqual(76);
  });
});

describe('akademie a konce kariér', () => {
  it('nábor: 2–5 dorostenců na klub, věk 15–16, POT 70+ zhruba u každého desátého', () => {
    const state = createGameState(createWorld(data, 'akademie'), { seed: 'akademie', userClubId: null });
    const before = state.players.length;
    for (let y = 0; y < 6; y++) for (const m of ['01', '07']) academyIntake(state, data, `2027-${m}-01`, new Rng(`${y}${m}`));
    const youth = state.players.slice(before);
    const perClubIntake = youth.length / 12 / data.clubs.filter((c) => !c.parentClubId).length;
    expect(perClubIntake).toBeGreaterThanOrEqual(2);
    expect(perClubIntake).toBeLessThanOrEqual(5);
    for (const p of youth) {
      expect(p.academy).toBe(true);
      const age = exactAge(p.birthDate, '2026-07-01');
      expect(age).toBeGreaterThanOrEqual(15);
      expect(age).toBeLessThan(17);
      expect(p.pot).toBeLessThanOrEqual(balance.potential.max);
    }
    const share70 = youth.filter((p) => p.pot >= 70).length / youth.length;
    expect(share70).toBeGreaterThan(0.05);
    expect(share70).toBeLessThan(0.15);
    expect(new Set(state.players.map((p) => p.id)).size).toBe(state.players.length);
  });

  it('konce kariér: tabulka podle pozic ze zadání (design, sekce 5)', () => {
    const base = { avgRating: 6.5, minutesShare: 0.6, level: 1 as const, professionalism: 50, injuryDays: 0 };
    const c = (age: number, position: 'GK' | 'CB' | 'CM' | 'ST', extra = {}) => retirementChance({ ...base, age, position, ...extra }, balance);
    expect(c(32.5, 'ST')).toBe(0);
    expect(c(33.2, 'ST')).toBeCloseTo(0.15);
    expect(c(33.2, 'CM')).toBeCloseTo(0.1);
    expect(c(33.2, 'CB')).toBe(0);
    expect(c(34, 'CB')).toBeCloseTo(0.1);
    expect(c(36, 'GK')).toBe(0);
    expect(c(37, 'GK')).toBeCloseTo(0.15);
    expect(c(40, 'GK')).toBeCloseTo(0.75);
    expect(c(41, 'GK')).toBe(1);
    expect(c(38, 'ST')).toBe(1);
    expect(c(45, 'CM')).toBe(1);
  });

  it('konce kariér: násobiče se násobí a výsledek je 0–1', () => {
    const base = { age: 35, position: 'CM' as const, avgRating: 6.5, minutesShare: 0.6, level: 1 as const, professionalism: 50, injuryDays: 0 };
    const c = (extra = {}) => retirementChance({ ...base, ...extra }, balance);
    expect(c()).toBeCloseTo(0.35);
    expect(c({ avgRating: 7.1, minutesShare: 0.8 })).toBeCloseTo(0.175); // super sezóna ×0,5
    expect(c({ avgRating: 7.1, minutesShare: 0.5 })).toBeCloseTo(0.35); // super známka, ale málo minut na super sezónu
    expect(c({ level: 3 })).toBeCloseTo(0.21); // 3. liga ×0,6
    expect(c({ professionalism: 80 })).toBeCloseTo(0.28); // ×0,8
    expect(c({ minutesShare: 0.2 })).toBeCloseTo(0.525); // málo minut ×1,5
    expect(c({ injuryDays: 120 })).toBeCloseTo(0.525); // dlouhé zranění ×1,5
    expect(c({ contractNextSeason: true })).toBeCloseTo(0.245); // smlouva ×0,7 (fáze 6)
    expect(c({ age: 37, minutesShare: 0.2, injuryDays: 120 })).toBe(1); // 0,75 × 1,5 × 1,5 omezeno na 1
  });
});
