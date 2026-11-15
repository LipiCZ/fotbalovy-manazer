// Calibration metrics: plays seasons and compares aggregated statistics with targets.
// Design targets (docs/design.md) are strict; our own estimates are only reported as checks.

import { loadDefaultData, type GameData } from '../../src/engine/data.ts';
import { autoTeamSheet, chooseLineup, isAvailable, lineupStrength } from '../../src/engine/lineup.ts';
import { playMatch } from '../../src/engine/match/engine.ts';
import { Rng } from '../../src/engine/rng.ts';
import { playSeason } from '../../src/engine/season.ts';
import type { Level } from '../../src/engine/types.ts';
import { createWorld } from '../../src/engine/world.ts';

export interface LevelAgg {
  matches: number;
  goals: number;
  homeWins: number;
  draws: number;
  shots: number;
  onTarget: number;
  xg: number;
  possessionDev: number;
  fouls: number;
  yellow: number;
  red: number;
  penalties: number;
  penaltiesScored: number;
  corners: number;
  injuries: number;
  ratingSum: number;
  ratingCount: number;
}

export interface Aggregate {
  seasons: number;
  levels: Record<Level, LevelAgg>;
  favouriteTop3: number;
  favouriteSeasons: number;
  cupMatches: number;
  cupUpsets: number;
}

const emptyLevel = (): LevelAgg => ({
  matches: 0, goals: 0, homeWins: 0, draws: 0, shots: 0, onTarget: 0, xg: 0, possessionDev: 0,
  fouls: 0, yellow: 0, red: 0, penalties: 0, penaltiesScored: 0, corners: 0, injuries: 0, ratingSum: 0, ratingCount: 0,
});

export function emptyAggregate(): Aggregate {
  return { seasons: 0, levels: { 1: emptyLevel(), 2: emptyLevel(), 3: emptyLevel() }, favouriteTop3: 0, favouriteSeasons: 0, cupMatches: 0, cupUpsets: 0 };
}

export function mergeAggregates(a: Aggregate, b: Aggregate): Aggregate {
  const out = emptyAggregate();
  out.seasons = a.seasons + b.seasons;
  for (const lvl of [1, 2, 3] as Level[])
    for (const k of Object.keys(out.levels[lvl]) as (keyof LevelAgg)[]) out.levels[lvl][k] = a.levels[lvl][k] + b.levels[lvl][k];
  out.favouriteTop3 = a.favouriteTop3 + b.favouriteTop3;
  out.favouriteSeasons = a.favouriteSeasons + b.favouriteSeasons;
  out.cupMatches = a.cupMatches + b.cupMatches;
  out.cupUpsets = a.cupUpsets + b.cupUpsets;
  return out;
}

/** Plays seasons `from`..`to-1` (one fresh world per season) plus cup upset samples. */
export function runSeasons(from: number, to: number, data: GameData = loadDefaultData(), cupPerSeason = 20): Aggregate {
  const agg = emptyAggregate();
  const favourites = data.clubs.filter((c) => c.competitionId === 'chance-liga' && c.size === 5).map((c) => c.id);
  const top = data.clubs.filter((c) => c.competitionId === 'chance-liga' && c.size === 5).map((c) => c.id);
  const minnows = data.clubs.filter((c) => c.competitionId !== 'chance-liga' && c.competitionId !== 'cnl' && !c.parentClubId && c.size <= 2).map((c) => c.id);

  for (let i = from; i < to; i++) {
    const world = createWorld(data, `calib-${i}`);
    const season = playSeason(world);
    agg.seasons++;
    for (const cs of season.competitions) {
      const a = agg.levels[cs.competition.level];
      for (const s of cs.summaries) {
        a.matches++;
        a.goals += s.homeGoals + s.awayGoals;
        if (s.homeGoals > s.awayGoals) a.homeWins++;
        else if (s.homeGoals === s.awayGoals) a.draws++;
        for (const t of [s.stats.home, s.stats.away]) {
          a.shots += t.shots;
          a.onTarget += t.shotsOnTarget;
          a.xg += t.xg;
          a.fouls += t.fouls;
          a.yellow += t.yellow;
          a.red += t.red;
          a.penalties += t.penalties;
          a.penaltiesScored += t.penaltiesScored;
          a.corners += t.corners;
        }
        a.possessionDev += Math.abs(s.stats.home.possession - 50);
        a.injuries += s.injuries;
        a.ratingSum += s.ratingSum;
        a.ratingCount += s.ratingCount;
      }
      if (cs.competition.id === 'chance-liga') {
        const top3 = cs.table.slice(0, 3).map((r) => r.clubId);
        for (const f of favourites) {
          agg.favouriteSeasons++;
          if (top3.includes(f)) agg.favouriteTop3++;
        }
      }
    }

    // Cup: a small 3rd-league club at home against a top club of the 1st league.
    const rng = new Rng(`cup-${i}`);
    const strength = (id: string) =>
      lineupStrength(chooseLineup(data.tactics.formations, (world.playersByClub.get(id) ?? []).filter(isAvailable), data.balance), data.balance);
    for (let k = 0; k < cupPerSeason; k++) {
      const homeId = rng.pick(minnows);
      const awayId = rng.pick(top);
      const home = autoTeamSheet(homeId, world.playersByClub.get(homeId) ?? [], data.tactics.formations, strength(awayId), data.balance);
      const away = autoTeamSheet(awayId, world.playersByClub.get(awayId) ?? [], data.tactics.formations, strength(homeId), data.balance);
      const r = playMatch(home, away, { level: 1, balance: data.balance, formations: data.tactics.formations, rng: rng.fork(`m${k}`) });
      agg.cupMatches++;
      // Win, or half of the draws as a stand-in for a penalty shoot-out.
      agg.cupUpsets += r.homeGoals > r.awayGoals ? 1 : r.homeGoals === r.awayGoals ? 0.5 : 0;
    }
  }
  return agg;
}

export interface Check {
  name: string;
  value: number;
  min: number;
  max: number;
  source: 'design' | 'odhad';
  ok: boolean;
}

export function evaluate(agg: Aggregate): Check[] {
  const checks: Check[] = [];
  const add = (name: string, value: number, min: number, max: number, source: Check['source']) =>
    checks.push({ name, value, min, max, source, ok: value >= min && value <= max });
  const L = agg.levels;
  const per = (lvl: Level, k: keyof LevelAgg, teams = 1) => L[lvl][k] / L[lvl].matches / teams;

  add('1. liga: góly na zápas', per(1, 'goals'), 2.35, 2.65, 'design');
  add('3. liga: góly na zápas', per(3, 'goals'), 3.0, 3.4, 'design');
  add('3. liga: výhry domácích %', 100 * per(3, 'homeWins'), 42, 48, 'design');
  add('3. liga: remízy %', 100 * per(3, 'draws'), 22, 28, 'design');
  add('pohár: postup týmu 3. ligy proti špičce %', (100 * agg.cupUpsets) / Math.max(1, agg.cupMatches), 5, 10, 'design');
  add('1. liga: výhry domácích %', 100 * per(1, 'homeWins'), 41, 48, 'odhad');
  add('1. liga: remízy %', 100 * per(1, 'draws'), 22, 30, 'odhad');
  add('2. liga: góly na zápas', per(2, 'goals'), 2.5, 3.1, 'odhad');
  for (const lvl of [1, 2, 3] as Level[]) {
    const prefix = `${lvl}. liga`;
    add(`${prefix}: xG / góly`, L[lvl].xg / L[lvl].goals, 0.95, 1.05, 'odhad');
    add(`${prefix}: průměrná známka`, L[lvl].ratingSum / L[lvl].ratingCount, 6.3, 6.7, 'design');
  }
  add('1. liga: střely na tým', per(1, 'shots', 2), 10, 14, 'odhad');
  add('1. liga: na branku na tým', per(1, 'onTarget', 2), 3.5, 5, 'odhad');
  add('1. liga: odchylka držení míče od 50 %', per(1, 'possessionDev'), 4, 12, 'odhad');
  add('1. liga: fauly na tým', per(1, 'fouls', 2), 11, 15, 'odhad');
  add('1. liga: žluté na tým', per(1, 'yellow', 2), 1.7, 2.6, 'odhad');
  add('1. liga: červené na zápas', per(1, 'red'), 0.08, 0.2, 'odhad');
  add('1. liga: penalty na zápas', per(1, 'penalties'), 0.2, 0.35, 'odhad');
  const pc = loadDefaultData().balance.calibration.penaltyConversion;
  const scored = L[1].penaltiesScored + L[2].penaltiesScored + L[3].penaltiesScored;
  const taken = L[1].penalties + L[2].penalties + L[3].penalties;
  add('proměněné penalty %', (100 * scored) / Math.max(1, taken), 100 * (pc.target - pc.tolerance), 100 * (pc.target + pc.tolerance), 'design');
  add('1. liga: rohy na tým', per(1, 'corners', 2), 4, 6, 'odhad');
  add('1. liga: zranění na zápas', per(1, 'injuries'), 0.15, 0.5, 'odhad');
  add('favorité (Slavia, Sparta, Plzeň) v top 3 %', (100 * agg.favouriteTop3) / Math.max(1, agg.favouriteSeasons), 50, 90, 'odhad');
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const rows = checks.map((c) => {
    const v = c.value.toFixed(2).replace('.', ',');
    const range = `${String(c.min).replace('.', ',')}–${String(c.max).replace('.', ',')}`;
    const mark = c.ok ? 'OK ' : c.source === 'design' ? 'CHYBA' : 'pozor';
    return `${mark.padEnd(6)} ${c.name.padEnd(46)} ${v.padStart(7)}   cíl ${range.padEnd(11)} (${c.source})`;
  });
  return rows.join('\n');
}
