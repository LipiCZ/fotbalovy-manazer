import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { ageOn, overall, seasonStartDate } from '../src/engine/players/rating.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const world = createWorld(data, 'test-world');
const onDate = seasonStartDate(world.seasonYear);
const levelOf = (clubId: string) => {
  const club = data.clubs.find((c) => c.id === clubId)!;
  return data.competitions.find((c) => c.id === club.competitionId)!.level;
};
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('generátor hráčů', () => {
  it('stejný seed = stejní hráči', () => {
    expect(createWorld(data, 'test-world').players).toEqual(world.players);
    expect(createWorld(data, 'jiny-seed').players).not.toEqual(world.players);
  });

  it('velikost kádru podle úrovně: 24 / 22 / 20, každý tým má brankáře', () => {
    const expected = { 1: 24, 2: 22, 3: 20 } as const;
    for (const club of data.clubs) {
      const squad = world.playersByClub.get(club.id)!;
      expect(squad, club.id).toHaveLength(expected[levelOf(club.id)]);
      expect(squad.filter((p) => p.positions[0] === 'GK').length, club.id).toBeGreaterThanOrEqual(2);
      expect(squad.filter((p) => p.role === 'S'), club.id).toHaveLength(11);
    }
  });

  it('hodnoty v rozsahu, POT ≥ CEL, 1–3 pozice bez duplicit, unikátní id', () => {
    expect(new Set(world.players.map((p) => p.id)).size).toBe(world.players.length);
    for (const p of world.players) {
      const cel = overall(p, data.balance);
      for (const v of [p.ts, p.fs, p.pot, cel]) expect(v).toBeGreaterThanOrEqual(1);
      for (const v of [p.ts, p.fs, p.pot, cel]) expect(v).toBeLessThanOrEqual(99);
      expect(p.pot).toBeGreaterThanOrEqual(cel);
      expect(p.positions.length).toBeGreaterThanOrEqual(1);
      expect(p.positions.length).toBeLessThanOrEqual(3);
      expect(new Set(p.positions).size).toBe(p.positions.length);
      const age = ageOn(p.birthDate, onDate);
      expect(age).toBeGreaterThanOrEqual(17);
      expect(age).toBeLessThanOrEqual(35);
      expect(p.firstName.length > 0 && p.lastName.length > 0).toBe(true);
    }
  });

  it('síla základních sestav odpovídá úrovni (design: 3. liga 45–55, 1. liga kolem 64–72)', () => {
    const starters = (lvl: 1 | 2 | 3) =>
      world.players.filter((p) => p.role === 'S' && levelOf(p.clubId) === lvl).map((p) => overall(p, data.balance));
    const [l1, l2, l3] = [mean(starters(1)), mean(starters(2)), mean(starters(3))];
    expect(l1).toBeGreaterThan(l2 + 5);
    expect(l2).toBeGreaterThan(l3 + 5);
    expect(l1).toBeGreaterThanOrEqual(63);
    expect(l1).toBeLessThanOrEqual(70);
    expect(l3).toBeGreaterThanOrEqual(45);
    expect(l3).toBeLessThanOrEqual(55);
  });

  it('opory Slavie a Sparty mají CEL 75–80, nikdo v lize výrazně nad 85', () => {
    for (const id of ['slavia-praha', 'sparta-praha']) {
      const best = Math.max(...world.playersByClub.get(id)!.map((p) => overall(p, data.balance)));
      expect(best, id).toBeGreaterThanOrEqual(74);
      expect(best, id).toBeLessThanOrEqual(85);
    }
  });

  it('větší klub v téže soutěži má v průměru silnější kádr', () => {
    const strengthBySize = (size: number) =>
      mean(
        world.players
          .filter((p) => {
            const c = data.clubs.find((x) => x.id === p.clubId)!;
            return c.competitionId === 'chance-liga' && c.size === size && p.role === 'S';
          })
          .map((p) => overall(p, data.balance)),
      );
    expect(strengthBySize(5)).toBeGreaterThan(strengthBySize(4));
    expect(strengthBySize(4)).toBeGreaterThan(strengthBySize(3));
  });

  it('B/C týmy jsou výrazně mladší než A-týmy', () => {
    const avgAge = (reserve: boolean) =>
      mean(
        world.players
          .filter((p) => (data.clubs.find((c) => c.id === p.clubId)!.parentClubId !== undefined) === reserve)
          .map((p) => ageOn(p.birthDate, onDate)),
      );
    expect(avgAge(true)).toBeLessThan(21.5);
    expect(avgAge(false) - avgAge(true)).toBeGreaterThan(3);
  });

  it('mladí mají větší rozdíl POT − CEL, mimořádné talenty jsou vzácné', () => {
    const gap = (lo: number, hi: number) =>
      mean(
        world.players
          .filter((p) => {
            const a = ageOn(p.birthDate, onDate);
            return a >= lo && a <= hi;
          })
          .map((p) => p.pot - overall(p, data.balance)),
      );
    expect(gap(17, 19)).toBeGreaterThan(gap(23, 25) + 4);
    expect(gap(29, 35)).toBeLessThan(1.5);
    expect(world.players.filter((p) => p.pot >= 85).length).toBeLessThanOrEqual(4);
  });
});
