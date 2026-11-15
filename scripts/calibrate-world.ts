// CLI: world stability over many seasons (phase 4 goal: 5 seasons in a row and beyond).
//
//   npm run calibrate:world                        # 8 worlds × 10 seasons
//   npm run calibrate:world -- --worlds 4 --seasons 6
//
// Exits with code 1 when a check fails.

import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadDefaultData } from '../src/engine/data.ts';
import { runWorld, type SeasonMetrics } from './lib/world.ts';

if (!isMainThread) {
  const { seeds, seasons } = workerData as { seeds: string[]; seasons: number };
  parentPort?.postMessage(seeds.map((s) => runWorld(s, seasons)));
} else {
  const { values } = parseArgs({ options: { worlds: { type: 'string', default: '8' }, seasons: { type: 'string', default: '10' }, workers: { type: 'string', default: String(Math.min(4, cpus().length)) } } });
  const worlds = Number(values.worlds);
  const seasons = Number(values.seasons);
  const workers = Math.max(1, Math.min(Number(values.workers), worlds));
  const seeds = Array.from({ length: worlds }, (_, i) => `world-${i}`);
  const started = Date.now();
  console.log(`Kalibrace světa: ${worlds} světů × ${seasons} sezón, ${workers} vlákna…`);
  const chunks = Array.from({ length: workers }, (_, w) => seeds.filter((_, i) => i % workers === w));
  const results = (
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<SeasonMetrics[][]>((resolve, reject) => {
            const worker = new Worker(new URL(import.meta.url), { workerData: { seeds: chunk, seasons }, execArgv: ['--import', 'tsx'] });
            worker.once('message', resolve);
            worker.once('error', reject);
          }),
      ),
    )
  ).flat();

  const avg = (season: number, f: (m: SeasonMetrics) => number) => results.reduce((s, w) => s + f(w[season]!), 0) / results.length;
  const n = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
  console.log('\nSezóna | top11 CEL 1./2./3. liga | kádry min–max | senioři | akademie | věk | POT 85+ / 78+ | góly 1./3. liga | domácí 3. liga % | skupiny 3. ligy');
  for (let s = 0; s < seasons; s++) {
    const min = Math.min(...results.map((w) => w[s]!.minSquad));
    const max = Math.max(...results.map((w) => w[s]!.maxSquad));
    console.log(
      `${String(s + 1).padStart(6)} | ${n(avg(s, (m) => m.top11[1]))} / ${n(avg(s, (m) => m.top11[2]))} / ${n(avg(s, (m) => m.top11[3]))} | ${min}–${max} | ${n(avg(s, (m) => m.seniors), 0)} | ${n(avg(s, (m) => m.academy), 0)} | ${n(avg(s, (m) => m.avgAge))} | ${n(avg(s, (m) => m.pot85))} / ${n(avg(s, (m) => m.pot78))} | ${n(avg(s, (m) => m.goals[1]), 2)} / ${n(avg(s, (m) => m.goals[3]), 2)} | ${n(avg(s, (m) => m.homeWins3))} | ${results[0]![s]!.groupSizes.join('/')}`,
    );
  }

  const data = loadDefaultData();
  // Strict: the phase 4 goal (5 seasons in a row, design section 16). Longer horizons are only
  // warnings: without transfers (phase 6) nothing moves players who outgrew their league upwards.
  const strictUntil = Math.min(seasons, 5) - 1;
  const last = seasons - 1;
  const checks: [string, 'ok' | 'fail' | 'warn'][] = [];
  const check = (label: string, ok: boolean, strict: boolean) => checks.push([label, ok ? 'ok' : strict ? 'fail' : 'warn']);
  for (const s of [...new Set([strictUntil, last])]) {
    for (const lvl of [1, 2, 3] as const) {
      const drift = avg(s, (m) => m.top11[lvl]) - avg(0, (m) => m.top11[lvl]);
      check(`síla ${lvl}. ligy se za ${s + 1} sezón posunula o ${n(drift)} (max ±2,5)`, Math.abs(drift) <= 2.5, s <= strictUntil);
    }
    const ageDrift = avg(s, (m) => m.avgAge) - avg(0, (m) => m.avgAge);
    check(`průměrný věk se za ${s + 1} sezón posunul o ${n(ageDrift)} roku (max ±1,5)`, Math.abs(ageDrift) <= 1.5, s <= strictUntil);
    check(`POT 85+ po ${s + 1} sezónách: ${n(avg(s, (m) => m.pot85))} (max 6)`, avg(s, (m) => m.pot85) <= 6, s <= strictUntil);
  }
  for (const lvl of [1, 2, 3] as const) {
    const share = avg(strictUntil, (m) => m.resultShare[lvl]);
    check(`hospodaření ${lvl}. ligy po ${strictUntil + 1} sezónách: výsledek ${n(100 * share)} % příjmů (odhad: −20 až +20 %)`, Math.abs(share) <= 0.2, false);
  }
  check(`AI kluby s vkladem majitele: ${n(100 * avg(strictUntil, (m) => m.ownerBailouts))} % (odhad: do 25 %)`, avg(strictUntil, (m) => m.ownerBailouts) <= 0.25, false);
  const limits = data.balance.squads.byLevel;
  const minLimit = Math.min(...Object.values(limits).map((l) => l.min));
  const maxLimit = Math.max(...Object.values(limits).map((l) => l.max));
  const allMin = Math.min(...results.flat().map((m) => m.minSquad));
  const allMax = Math.max(...results.flat().map((m) => m.maxSquad));
  check(`velikost kádrů ${allMin}–${allMax} (meze ${minLimit - 2}–${maxLimit + 1})`, allMin >= minLimit - 2 && allMax <= maxLimit + 1, true);
  for (let s = 0; s < seasons; s++) {
    const g1 = avg(s, (m) => m.goals[1]);
    const g3 = avg(s, (m) => m.goals[3]);
    if (g1 < 2.3 || g1 > 2.7 || g3 < 2.95 || g3 > 3.45) check(`góly v ${s + 1}. sezóně mimo cíl: ${n(g1, 2)} / ${n(g3, 2)}`, false, s <= strictUntil);
  }
  console.log('');
  for (const [label, result] of checks) console.log(`${result === 'ok' ? 'OK    ' : result === 'fail' ? 'CHYBA ' : 'pozor '} ${label}`);
  console.log(`\nHotovo za ${((Date.now() - started) / 1000).toFixed(0)} s. Přísně se hlídá prvních ${strictUntil + 1} sezón (cíl fáze 4), delší výhled jen upozorňuje.`);
  process.exit(checks.some(([, r]) => r === 'fail') ? 1 : 0);
}
