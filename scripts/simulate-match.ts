// CLI: simulate one match in quick mode and print the report.
//
//   npm run match -- --home slavia-praha --away sparta-praha --seed 1

import { parseArgs } from 'node:util';
import { loadDefaultData } from '../src/engine/data.ts';
import { autoTeamSheet, chooseLineup, isAvailable, lineupStrength } from '../src/engine/lineup.ts';
import { playMatch } from '../src/engine/match/engine.ts';
import type { MatchEvent } from '../src/engine/match/types.ts';
import { Rng } from '../src/engine/rng.ts';
import { POSITION_LABEL_CS, type Level } from '../src/engine/types.ts';
import { createWorld } from '../src/engine/world.ts';

const { values } = parseArgs({
  options: {
    home: { type: 'string', default: 'slavia-praha' },
    away: { type: 'string', default: 'sparta-praha' },
    seed: { type: 'string', default: '1' },
  },
});

const data = loadDefaultData();
const world = createWorld(data, values.seed);
const club = (id: string) => {
  const c = data.clubs.find((x) => x.id === id);
  if (!c) {
    console.error(`Neznámý klub "${id}". Použij id z data/clubs.json.`);
    process.exit(1);
  }
  return c;
};
const home = club(values.home);
const away = club(values.away);
const level = data.competitions.find((c) => c.id === home.competitionId)?.level as Level;
const squad = (id: string) => world.playersByClub.get(id) ?? [];
const strength = (id: string) =>
  lineupStrength(chooseLineup(data.tactics.formations, squad(id).filter(isAvailable), data.balance), data.balance);

const homeSheet = autoTeamSheet(home.id, squad(home.id), data.tactics.formations, strength(away.id), data.balance);
const awaySheet = autoTeamSheet(away.id, squad(away.id), data.tactics.formations, strength(home.id), data.balance);
const report = playMatch(homeSheet, awaySheet, {
  level,
  balance: data.balance,
  formations: data.tactics.formations,
  rng: new Rng(values.seed).fork(`match:${home.id}:${away.id}`),
});

const name = new Map(world.players.map((p) => [p.id, `${p.firstName.charAt(0)}. ${p.lastName}`]));
const styleName = new Map(data.tactics.styles.map((s) => [s.id, s.name]));
const mentName = new Map(data.tactics.mentalities.map((s) => [s.id, s.name]));
const pressName = new Map(data.tactics.pressing.map((s) => [s.id, s.name]));
const minute = (e: MatchEvent) => (e.added ? `${e.minute}+${e.added}'` : `${e.minute}'`);
const side = (s: 'home' | 'away') => (s === 'home' ? home.shortName : away.shortName);

console.log(`\n${home.name}  ${report.homeGoals} : ${report.awayGoals}  ${away.name}\n`);
for (const [label, sheet] of [
  [home.shortName, homeSheet],
  [away.shortName, awaySheet],
] as const) {
  const t = sheet.tactics;
  console.log(`${label}: ${t.formation}, ${styleName.get(t.style)}, ${mentName.get(t.mentality)}, presink ${pressName.get(t.pressing)}`);
}
console.log('\nUdálosti:');
for (const e of report.events) {
  const who = e.playerId ? name.get(e.playerId) : '';
  const txt: Record<string, string> = {
    goal: `⚽ gól ${who}${e.otherPlayerId ? ` (asistence ${name.get(e.otherPlayerId)})` : ''}, xG ${e.xg?.toFixed(2)}`,
    penaltyGoal: `⚽ gól z penalty ${who}`,
    penaltyMiss: `✗ neproměněná penalta ${who}`,
    bigChance: `velká šance ${who}, xG ${e.xg?.toFixed(2)}`,
    yellow: `🟨 ${who}`,
    secondYellow: `🟨🟥 druhá žlutá ${who}`,
    red: `🟥 ${who}`,
    injury: `✚ zranění ${who}: ${e.injury?.type}, ${e.injury?.daysLeft} dní`,
    sub: `⇄ ${e.otherPlayerId ? name.get(e.otherPlayerId) : ''} za ${who}`,
    mentality: `nastavení týmu: ${e.mentality ? mentName.get(e.mentality) : ''}`,
  };
  console.log(`${minute(e).padStart(6)}  ${side(e.side).padEnd(12)} ${txt[e.type]}`);
}
const s = report.stats;
const row = (label: string, h: string | number, a: string | number) =>
  console.log(`${String(h).padStart(8)}  ${label.padEnd(16)} ${String(a)}`);
console.log('\nStatistiky:');
row('góly', s.home.goals, s.away.goals);
row('xG', s.home.xg.toFixed(2), s.away.xg.toFixed(2));
row('střely', s.home.shots, s.away.shots);
row('na branku', s.home.shotsOnTarget, s.away.shotsOnTarget);
row('držení míče %', s.home.possession, s.away.possession);
row('fauly', s.home.fouls, s.away.fouls);
row('žluté / červené', `${s.home.yellow}/${s.home.red}`, `${s.away.yellow}/${s.away.red}`);
row('rohy', s.home.corners, s.away.corners);

console.log('\nZnámky:');
for (const sd of ['home', 'away'] as const) {
  const lines = report.players.filter((l) => l.side === sd && l.minutesPlayed > 0);
  console.log(`  ${side(sd)}: ` + lines.map((l) => `${POSITION_LABEL_CS[l.slot]} ${name.get(l.playerId)} ${l.rating.toFixed(1)}`).join(', '));
}
console.log(`\nHráč zápasu: ${report.manOfTheMatchId ? name.get(report.manOfTheMatchId) : '–'}`);
console.log(`\nAsistent: ${report.explanation.join(' ')}\n`);
