import { describe, expect, it } from 'vitest';
import { evaluate, runSeasons } from '../scripts/lib/calibration.ts';

// Malý vzorek pro běžné testy. Plná kalibrace: npm run calibrate -- --seasons 1000
describe('kalibrace (6 sezón, širší tolerance kvůli malému vzorku)', () => {
  const checks = new Map(evaluate(runSeasons(0, 6)).map((c) => [c.name, c]));
  const value = (name: string) => checks.get(name)!.value;

  it('góly: 1. liga ~2,5, 3. liga ~3,2', () => {
    expect(value('1. liga: góly na zápas')).toBeGreaterThan(2.3);
    expect(value('1. liga: góly na zápas')).toBeLessThan(2.75);
    expect(value('3. liga: góly na zápas')).toBeGreaterThan(2.95);
    expect(value('3. liga: góly na zápas')).toBeLessThan(3.45);
  });

  it('3. liga: domácí vyhrávají ~45 %, remízy ~25 %', () => {
    expect(value('3. liga: výhry domácích %')).toBeGreaterThan(40);
    expect(value('3. liga: výhry domácích %')).toBeLessThan(50);
    expect(value('3. liga: remízy %')).toBeGreaterThan(19);
    expect(value('3. liga: remízy %')).toBeLessThan(29);
  });

  it('pohár: tým 3. ligy má proti špičce šanci zhruba 5–10 %', () => {
    expect(value('pohár: postup týmu 3. ligy proti špičce %')).toBeGreaterThan(3);
    expect(value('pohár: postup týmu 3. ligy proti špičce %')).toBeLessThan(14);
  });

  it('průměrná známka ~6,5 a xG odpovídá gólům', () => {
    expect(value('1. liga: průměrná známka')).toBeGreaterThan(6.3);
    expect(value('1. liga: průměrná známka')).toBeLessThan(6.7);
    expect(value('1. liga: xG / góly')).toBeGreaterThan(0.9);
    expect(value('1. liga: xG / góly')).toBeLessThan(1.1);
  });
});
