import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import {
  autoTeamSheet,
  bestLineup,
  chooseBench,
  chooseLineup,
  fitKind,
  hungarian,
  isAvailable,
  positionFit,
  slotValue,
} from '../src/engine/lineup.ts';
import { Rng } from '../src/engine/rng.ts';
import type { Player, Position } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const data = loadDefaultData();
const { balance } = data;
const world = createWorld(data, 'lineup');
const squad = (id: string) => [...(world.playersByClub.get(id) ?? [])];
const f442 = data.tactics.formations.find((f) => f.id === '4-4-2')!;

function bruteForce(cost: number[][]): number {
  const n = cost.length;
  const m = cost[0]!.length;
  let best = Infinity;
  const used = new Array(m).fill(false);
  const rec = (i: number, acc: number) => {
    if (i === n) return void (best = Math.min(best, acc));
    for (let j = 0; j < m; j++) {
      if (used[j]) continue;
      used[j] = true;
      rec(i + 1, acc + cost[i]![j]!);
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

describe('vhodnost pozice', () => {
  const p = { positions: ['ST', 'AM'] as Position[] };
  it('přirozená 100 %, příbuzná 90 %, cizí 70 %', () => {
    expect(positionFit(p, 'ST', balance)).toBe(1);
    expect(positionFit(p, 'AM', balance)).toBe(1);
    expect(fitKind(p, 'LW', balance)).toBe('related');
    expect(positionFit(p, 'LW', balance)).toBe(0.9);
    expect(positionFit(p, 'CB', balance)).toBe(0.7);
  });
  it('brankář a hráč v poli nejsou nikdy příbuzní', () => {
    expect(fitKind({ positions: ['GK'] }, 'CB', balance)).toBe('foreign');
    expect(fitKind({ positions: ['CB'] }, 'GK', balance)).toBe('foreign');
  });
});

describe('maďarská metoda', () => {
  it('najde optimum (ověřeno hrubou silou na náhodných maticích)', () => {
    const rng = new Rng('hungarian');
    for (let t = 0; t < 40; t++) {
      const n = rng.int(1, 5);
      const m = rng.int(n, 7);
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => rng.int(-50, 50)));
      const assignment = hungarian(cost);
      expect(new Set(assignment).size).toBe(n);
      expect(assignment.reduce((s, j, i) => s + cost[i]![j]!, 0)).toBe(bruteForce(cost));
    }
  });
});

describe('výběr sestavy', () => {
  it('11 různých hráčů, brankář v brance', () => {
    const choice = chooseLineup(data.tactics.formations, squad('slavia-praha'), balance);
    const ids = choice.lineup.map((p) => p?.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(11);
    expect(choice.lineup[choice.slots.indexOf('GK')]!.positions[0]).toBe('GK');
  });

  it('optimální sestava není horší než hladový výběr', () => {
    for (const club of data.clubs.slice(0, 20)) {
      const players = squad(club.id);
      const choice = bestLineup(f442, players, balance);
      const used = new Set<string>();
      let greedy = 0;
      for (const slot of f442.slots) {
        const best = players.filter((p) => !used.has(p.id)).sort((a, b) => slotValue(b, slot, balance) - slotValue(a, slot, balance))[0]!;
        used.add(best.id);
        greedy += slotValue(best, slot, balance);
      }
      expect(choice.total).toBeGreaterThanOrEqual(greedy - 1e-9);
    }
  });

  it('zraněný ani vyloučený hráč nenastoupí ani nesedí na lavičce', () => {
    const players = structuredClone(squad('sparta-praha')) as Player[];
    const first = chooseLineup(data.tactics.formations, players, balance);
    const injured = first.lineup[1]!;
    const suspended = first.lineup[5]!;
    players.find((p) => p.id === injured.id)!.state.injury = { type: 'natažený sval', daysLeft: 10 };
    players.find((p) => p.id === suspended.id)!.state.suspensionMatches = 1;
    expect(isAvailable(players.find((p) => p.id === injured.id)!)).toBe(false);
    const sheet = autoTeamSheet('sparta-praha', players, data.tactics.formations, 60, balance);
    const all = [...sheet.lineup, ...sheet.bench].map((p) => p?.id);
    expect(all).not.toContain(injured.id);
    expect(all).not.toContain(suspended.id);
  });

  it('při nedostatku hráčů zůstanou sloty prázdné', () => {
    const choice = bestLineup(f442, squad('slavia-praha').slice(0, 8), balance);
    expect(choice.lineup.filter((p) => p === null)).toHaveLength(3);
  });

  it('lavička: nejvýš 9 hráčů, náhradní brankář první, nikdo ze základní sestavy', () => {
    const players = squad('viktoria-plzen');
    const choice = chooseLineup(data.tactics.formations, players, balance);
    const xi = new Set(choice.lineup.map((p) => p!.id));
    const bench = chooseBench(players.filter((p) => !xi.has(p.id)), balance.match.subs.benchSize, balance);
    expect(bench.length).toBeLessThanOrEqual(9);
    expect(bench[0]!.positions[0]).toBe('GK');
    expect(bench.some((p) => xi.has(p.id))).toBe(false);
  });

  it('taktika AI je platná a kapitán i exekutor standardek jsou v sestavě', () => {
    const sheet = autoTeamSheet('slavia-praha', squad('slavia-praha'), data.tactics.formations, 60, balance);
    const ids = sheet.lineup.map((p) => p?.id);
    expect(data.tactics.styles.map((s) => s.id)).toContain(sheet.tactics.style);
    expect(sheet.tactics.mentality).toBe('attacking'); // Slavia proti výrazně slabšímu soupeři
    expect(ids).toContain(sheet.tactics.captainId);
    expect(ids).toContain(sheet.tactics.setPieceTakerId);
  });
});
