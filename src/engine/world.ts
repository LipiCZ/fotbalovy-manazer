// A generated game world: validated data + fictional players for the starting season.

import type { GameData } from './data.ts';
import { generateAllPlayers, type GeneratedPlayer } from './players/generate.ts';
import { overall } from './players/rating.ts';
import { Rng, type Seed } from './rng.ts';

export interface World {
  seed: string;
  seasonYear: number;
  data: GameData;
  players: GeneratedPlayer[];
  playersByClub: Map<string, GeneratedPlayer[]>;
}

export function createWorld(data: GameData, seed: Seed, seasonYear = 2026): World {
  const rng = new Rng(seed);
  const players = generateAllPlayers(data, seasonYear, rng.fork('players'));
  const playersByClub = new Map<string, GeneratedPlayer[]>(data.clubs.map((c) => [c.id, []]));
  for (const p of players) playersByClub.get(p.clubId)?.push(p);
  return { seed: rng.seed, seasonYear, data, players, playersByClub };
}

/** Team strength = mean CEL of the best `topN` players of the squad. */
export function teamStrength(world: World, clubId: string): number {
  const squad = world.playersByClub.get(clubId) ?? [];
  const topN = world.data.balance.simpleResults.teamStrengthTopN;
  const best = squad
    .map((p) => overall(p, world.data.balance))
    .sort((a, b) => b - a)
    .slice(0, topN);
  return best.length === 0 ? 0 : best.reduce((s, v) => s + v, 0) / best.length;
}
