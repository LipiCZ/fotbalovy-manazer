import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { generateAttributes } from '../src/engine/players/generate.ts';
import { celAt, fsAt, overall, tsAt } from '../src/engine/players/rating.ts';
import { Rng } from '../src/engine/rng.ts';
import { ATTRIBUTES, GK_TECH, OUTFIELD_TECH, POSITIONS, type Attributes } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const { balance } = data;
const flat = (v: number): Attributes => Object.fromEntries(ATTRIBUTES.map((a) => [a, v])) as Attributes;

describe('TS, FS a CEL z atributů', () => {
  it('stejné atributy dají stejné TS, FS i CEL na každé pozici', () => {
    for (const pos of POSITIONS) {
      expect(tsAt({ attributes: flat(60) }, pos, balance)).toBeCloseTo(60);
      expect(fsAt({ attributes: flat(60) }, pos, balance)).toBeCloseTo(60);
      expect(celAt({ attributes: flat(60) }, pos, balance)).toBeCloseTo(60);
    }
  });

  it('útočník: zakončení má váhu 35 % (design, sekce 11)', () => {
    const a = { ...flat(60), finishing: 80 };
    expect(tsAt({ attributes: a }, 'ST', balance)).toBeCloseTo(67);
    // Pro stopera zakončení nehraje roli.
    expect(tsAt({ attributes: a }, 'CB', balance)).toBeCloseTo(60);
  });

  it('brankáře hodnotí brankářské atributy, hráče v poli ne', () => {
    const a = { ...flat(40), reflexes: 90, handling: 90, oneOnOne: 90, gkPositioning: 90, distribution: 90 };
    expect(tsAt({ attributes: a }, 'GK', balance)).toBeCloseTo(90);
    expect(tsAt({ attributes: a }, 'ST', balance)).toBeCloseTo(40);
  });
});

describe('generátor atributů', () => {
  it('trefí cílové TS a FS pro každou pozici (± 1,5)', () => {
    const rng = new Rng('attr');
    for (const pos of POSITIONS) {
      for (let i = 0; i < 30; i++) {
        const ts = rng.float(40, 80);
        const fs = rng.float(40, 80);
        const attributes = generateAttributes(pos, ts, fs, balance, rng);
        expect(Math.abs(tsAt({ attributes }, pos, balance) - ts), `${pos} TS`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(fsAt({ attributes }, pos, balance) - fs), `${pos} FS`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  const world = createWorld(data, 'attributes');
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const main = (pos: string) => world.players.filter((p) => p.positions[0] === pos);

  it('atributy důležité pro pozici jsou vyšší než nedůležité', () => {
    expect(mean(main('ST').map((p) => p.attributes.finishing))).toBeGreaterThan(mean(main('ST').map((p) => p.attributes.tackling)) + 5);
    expect(mean(main('CB').map((p) => p.attributes.tackling))).toBeGreaterThan(mean(main('CB').map((p) => p.attributes.finishing)) + 5);
    expect(mean(main('GK').map((p) => p.attributes.reflexes))).toBeGreaterThan(mean(main('GK').map((p) => p.attributes.finishing)) + 15);
  });

  it('hráči v poli mají brankářské atributy nízké, brankáři hráčské technické nízké', () => {
    for (const p of world.players) {
      if (p.positions[0] === 'GK') {
        const gk = Math.min(...GK_TECH.map((a) => p.attributes[a]));
        const outfield = Math.max(...OUTFIELD_TECH.map((a) => p.attributes[a]));
        expect(outfield, p.id).toBeLessThan(gk + 25);
      } else {
        for (const a of GK_TECH) expect(p.attributes[a], `${p.id} ${a}`).toBeLessThanOrEqual(balance.attributes.generation.outfieldGkTech.max);
      }
    }
  });

  it('všechny atributy a skryté hodnoty jsou v rozsahu 1–99, počáteční stav je čistý', () => {
    for (const p of world.players) {
      for (const a of ATTRIBUTES) {
        expect(p.attributes[a]).toBeGreaterThanOrEqual(1);
        expect(p.attributes[a]).toBeLessThanOrEqual(99);
      }
      for (const v of [...Object.values(p.hidden), p.leadership]) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
      expect(p.state).toEqual({ condition: 100, recentRatings: [], suspensionMatches: 0, yellowCards: 0 });
      expect(overall(p, balance)).toBe(Math.round(celAt(p, p.positions[0]!, balance)));
    }
  });
});
