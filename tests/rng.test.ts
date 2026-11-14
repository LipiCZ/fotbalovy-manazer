import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng.ts';

describe('Rng', () => {
  it('stejný seed dává stejnou posloupnost', () => {
    const a = new Rng(42);
    const b = new Rng('42');
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('různý seed dává jinou posloupnost', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('fork nezávisí na tom, kolik čísel rodič už vytáhl', () => {
    const a = new Rng('x');
    const b = new Rng('x');
    for (let i = 0; i < 100; i++) b.next();
    expect(a.fork('players').next()).toBe(b.fork('players').next());
    expect(a.fork('players').next()).not.toBe(a.fork('season').next());
  });

  it('int respektuje hranice včetně krajních hodnot', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('poisson má průměr blízký lambda', () => {
    const rng = new Rng(3);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rng.poisson(1.5);
    expect(sum / n).toBeCloseTo(1.5, 1);
  });

  it('shuffle vrací permutaci a nemění vstup', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const out = new Rng(9).shuffle(input);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect([...out].sort()).toEqual(input);
  });
});
