import { describe, expect, it } from 'vitest';
import clubsJson from '../data/clubs.json';
import competitionsJson from '../data/competitions.json';
import regionsJson from '../data/regions.json';
import namesJson from '../data/names.json';
import balanceJson from '../data/balance.json';
import tacticsJson from '../data/tactics.json';
import flavorJson from '../data/flavor.json';
import pyramidJson from '../data/pyramid.json';
import { DataValidationError, loadDefaultData, validateGameData } from '../src/engine/data.ts';

type RawClub = Record<string, unknown> & { id: string };
const raw = (clubs: RawClub[] = structuredClone(clubsJson) as RawClub[]) => ({
  regions: regionsJson,
  competitions: competitionsJson,
  clubs,
  names: namesJson,
  balance: balanceJson,
  tactics: tacticsJson,
  pyramid: pyramidJson,
  flavor: flavorJson,
});
const clubs = () => structuredClone(clubsJson) as RawClub[];
const problemsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DataValidationError) return e.problems;
    throw e;
  }
  return [];
};

describe('herní data', () => {
  const data = loadDefaultData();

  it('obsahují 82 klubů v 5 soutěžích (16/16/16/16/18)', () => {
    expect(data.clubs).toHaveLength(82);
    const count = (id: string) => data.clubs.filter((c) => c.competitionId === id).length;
    expect([count('chance-liga'), count('cnl'), count('cfl-a'), count('cfl-b'), count('msfl')]).toEqual([16, 16, 16, 16, 18]);
  });

  it('všech 14 krajů a každý klub má platný kraj', () => {
    expect(data.regions).toHaveLength(14);
  });

  it('každý A-tým, jehož B-tým je v datech, má hasReserveTeam = true', () => {
    for (const c of data.clubs.filter((x) => x.parentClubId)) {
      expect(data.clubs.find((p) => p.id === c.parentClubId)?.hasReserveTeam).toBe(true);
    }
  });
});

describe('validace dat', () => {
  it('B-tým ve stejné soutěži jako A-tým je chyba', () => {
    const c = clubs();
    // Přesuneme Slavii B do 1. ligy a Teplice do 2. ligy, aby seděly počty týmů.
    c.find((x) => x.id === 'slavia-praha-b')!.competitionId = 'chance-liga';
    c.find((x) => x.id === 'teplice')!.competitionId = 'cnl';
    const problems = problemsOf(() => validateGameData(raw(c)));
    expect(problems.some((p) => p.includes('slavia-praha-b') && p.includes('stejnou soutěž'))).toBe(true);
    expect(problems.some((p) => p.includes('slavia-praha-b') && p.includes('1. ligu'))).toBe(true);
  });

  it('neexistující parentClubId je chyba', () => {
    const c = clubs();
    c.find((x) => x.id === 'sparta-praha-b')!.parentClubId = 'sparta-praga';
    expect(problemsOf(() => validateGameData(raw(c)))).toContainEqual(expect.stringContaining('"sparta-praga" neexistuje'));
  });

  it('dva týmy stejného klubu v jedné soutěži jsou chyba', () => {
    const c = clubs();
    // Slavia C do 2. ligy k Slavii B, Kladno do ČFL A (kvůli počtům).
    c.find((x) => x.id === 'slavia-praha-c')!.competitionId = 'cnl';
    c.find((x) => x.id === 'kladno')!.competitionId = 'cfl-a';
    expect(problemsOf(() => validateGameData(raw(c)))).toContainEqual(expect.stringContaining('tým stejného klubu'));
  });

  it('B-tým nesmí hrát vyšší soutěž než A-tým', () => {
    const c = clubs();
    c.find((x) => x.id === 'dukla-praha-b')!.competitionId = 'cnl';
    c.find((x) => x.id === 'dukla-praha')!.competitionId = 'cfl-a';
    expect(problemsOf(() => validateGameData(raw(c)))).toContainEqual(expect.stringContaining('vyšší úroveň'));
  });

  it('špatná barva, kraj, velikost a počet týmů jsou chyby', () => {
    const c = clubs();
    c[0]!.primaryColor = 'red';
    c[1]!.regionId = 'atlantida';
    c[2]!.size = 7;
    c.pop();
    const problems = problemsOf(() => validateGameData(raw(c)));
    expect(problems).toContainEqual(expect.stringContaining('primaryColor'));
    expect(problems).toContainEqual(expect.stringContaining('atlantida'));
    expect(problems).toContainEqual(expect.stringContaining('size'));
    expect(problems).toContainEqual(expect.stringContaining('očekáváno 18 týmů'));
  });

  it('duplicitní id je chyba', () => {
    const c = clubs();
    c[1]!.id = c[0]!.id;
    expect(problemsOf(() => validateGameData(raw(c)))).toContainEqual(expect.stringContaining('duplicitní id'));
  });
});
