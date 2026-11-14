// CLI: simulate a whole season of all competitions and print the final tables.
//
//   npm run simulate                      # seed 1
//   npm run simulate -- --seed 42
//   npm run simulate -- --seed 42 --squad slavia-praha   # also print one squad
//   npm run simulate -- --seed 42 --json out/season.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDefaultData } from '../src/engine/data.ts';
import { ageOn, overall, seasonStartDate } from '../src/engine/players/rating.ts';
import { playSeason } from '../src/engine/season.ts';
import { POSITION_LABEL_CS } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    squad: { type: 'string' },
    json: { type: 'string' },
  },
});

const data = loadDefaultData();
const world = createWorld(data, values.seed);
const season = playSeason(world);
const clubName = new Map(data.clubs.map((c) => [c.id, c.shortName]));

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

console.log(`Fotbalový manažer CZ – simulace sezóny ${world.seasonYear}/${String(world.seasonYear + 1).slice(2)} (seed ${world.seed})`);
console.log(`Hráčů vygenerováno: ${world.players.length}\n`);

for (const cs of season.competitions) {
  const n = cs.results.length;
  const goals = cs.results.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
  const homeWins = cs.results.filter((r) => r.homeGoals > r.awayGoals).length;
  const draws = cs.results.filter((r) => r.homeGoals === r.awayGoals).length;
  const rounds = Math.max(...cs.fixtures.map((f) => f.round));

  console.log(`${cs.competition.name} (${rounds} kol)`);
  console.log(`${lpad('#', 3)}  ${pad('Klub', 16)}${lpad('Z', 3)}${lpad('V', 4)}${lpad('R', 4)}${lpad('P', 4)}${lpad('Skóre', 9)}${lpad('Body', 6)}${lpad('Síla', 7)}`);
  cs.table.forEach((row, i) => {
    const score = `${row.goalsFor}:${row.goalsAgainst}`;
    console.log(
      `${lpad(i + 1, 3)}  ${pad(clubName.get(row.clubId) ?? row.clubId, 16)}${lpad(row.played, 3)}${lpad(row.won, 4)}${lpad(row.drawn, 4)}${lpad(row.lost, 4)}${lpad(score, 9)}${lpad(row.points, 6)}${lpad((cs.strength.get(row.clubId) ?? 0).toFixed(1), 7)}`,
    );
  });
  console.log(
    `     Góly/zápas ${(goals / n).toFixed(2)} · výhry domácích ${((100 * homeWins) / n).toFixed(0)} % · remízy ${((100 * draws) / n).toFixed(0)} % · hosté ${((100 * (n - homeWins - draws)) / n).toFixed(0)} %\n`,
  );
}

if (values.squad) {
  const club = data.clubs.find((c) => c.id === values.squad);
  if (!club) {
    console.error(`Neznámý klub "${values.squad}". Použij id z data/clubs.json, např. slavia-praha.`);
    process.exit(1);
  }
  const onDate = seasonStartDate(world.seasonYear);
  const squad = [...(world.playersByClub.get(club.id) ?? [])].sort((a, b) => overall(b, data.balance) - overall(a, data.balance));
  console.log(`Kádr: ${club.name}`);
  console.log(`${pad('Poz.', 10)}${pad('Jméno', 26)}${lpad('Věk', 4)}${lpad('CEL', 5)}${lpad('POT', 5)}${lpad('TS', 4)}${lpad('FS', 4)}  Role`);
  for (const p of squad) {
    const pos = p.positions.map((x) => POSITION_LABEL_CS[x]).join('/');
    console.log(
      `${pad(pos, 10)}${pad(`${p.firstName} ${p.lastName}`, 26)}${lpad(ageOn(p.birthDate, onDate), 4)}${lpad(overall(p, data.balance), 5)}${lpad(p.pot, 5)}${lpad(p.ts, 4)}${lpad(p.fs, 4)}  ${p.role}`,
    );
  }
}

if (values.json) {
  mkdirSync(dirname(values.json), { recursive: true });
  const out = {
    seed: season.seed,
    seasonYear: season.seasonYear,
    competitions: season.competitions.map((cs) => ({
      id: cs.competition.id,
      name: cs.competition.name,
      table: cs.table,
      results: cs.results,
    })),
  };
  writeFileSync(values.json, JSON.stringify(out, null, 2));
  console.log(`Uloženo do ${values.json}`);
}
