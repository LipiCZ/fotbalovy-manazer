// CLI: calibration run. Plays N seasons (in parallel workers) and compares with targets.
//
//   npm run calibrate                       # 200 seasons
//   npm run calibrate -- --seasons 1000 --workers 4
//
// Exits with code 1 if a design target (docs/design.md) is out of range.

import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { emptyAggregate, evaluate, formatChecks, mergeAggregates, runSeasons, type Aggregate } from './lib/calibration.ts';

if (!isMainThread) {
  const { from, to } = workerData as { from: number; to: number };
  parentPort?.postMessage(runSeasons(from, to));
} else {
  const { values } = parseArgs({
    options: {
      seasons: { type: 'string', default: '200' },
      workers: { type: 'string', default: String(Math.max(1, Math.min(4, cpus().length))) },
    },
  });
  const seasons = Number(values.seasons);
  const workers = Math.max(1, Math.min(Number(values.workers), seasons));
  const started = Date.now();
  console.log(`Kalibrace: ${seasons} sezón, ${workers} vlákna…`);

  const chunk = Math.ceil(seasons / workers);
  const jobs: Promise<Aggregate>[] = [];
  for (let w = 0; w < workers; w++) {
    const from = w * chunk;
    const to = Math.min(seasons, from + chunk);
    if (from >= to) continue;
    jobs.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { from, to }, execArgv: ['--import', 'tsx'] });
        worker.once('message', resolve);
        worker.once('error', reject);
      }),
    );
  }
  const agg = (await Promise.all(jobs)).reduce(mergeAggregates, emptyAggregate());
  const checks = evaluate(agg);
  console.log(`\n${formatChecks(checks)}\n`);
  const failed = checks.filter((c) => !c.ok && c.source === 'design');
  const warned = checks.filter((c) => !c.ok && c.source === 'odhad');
  console.log(`Hotovo za ${((Date.now() - started) / 1000).toFixed(0)} s. Cíle z designu: ${checks.filter((c) => c.source === 'design').length - failed.length}/${checks.filter((c) => c.source === 'design').length} OK, odhady mimo rozsah: ${warned.length}.`);
  process.exit(failed.length > 0 ? 1 : 0);
}
