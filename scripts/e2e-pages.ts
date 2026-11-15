// Smoke test of the production build as GitHub Pages serves it: under the /fotbalovy-manazer/
// sub-path. Checks that the assets and game data load, the game saves to IndexedDB, and a
// reloaded page lists and loads the save.
//
//   npm run build && npm run e2e:pages
//   npm run e2e:pages -- --url https://lipicz.github.io/fotbalovy-manazer/   # the live site

import { chromium } from 'playwright';
import { preview } from 'vite';
import { PAGES_BASE } from '../vite.config.ts';

const urlArg = process.argv.indexOf('--url');
const external = urlArg >= 0 ? process.argv[urlArg + 1] : undefined;
const server = external ? null : await preview({ preview: { port: 4188, strictPort: true }, logLevel: 'error' });
const url = external ?? `http://localhost:4188${PAGES_BASE}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const failedRequests: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));

let ok = true;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    if (errors.length > 0 || failedRequests.length > 0) throw new Error([...errors, ...failedRequests].join(' | '));
    console.log(`✓ ${name}`);
  } catch (e) {
    ok = false;
    console.error(`✗ ${name}: ${(e as Error).message}`);
  }
}

await check(`stránka a data se načtou (${url})`, async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Nová hra' }).click();
  await page.getByLabel('Jméno trenéra').fill('Pages Test');
  await page.getByLabel('Semínko světa', { exact: false }).fill('pages');
  await page.getByRole('button', { name: 'Volný výběr' }).click();
  // Club list comes from the bundled data (clubs.json).
  await page.getByRole('button', { name: /Bohemians Praha 1905/ }).click();
  await page.getByRole('button', { name: 'Začít kariéru' }).click();
  await page.getByRole('heading', { name: 'Další zápas' }).waitFor();
});

let savedDate = '';
await check('zápas a uložení do IndexedDB', async () => {
  await page.getByRole('button', { name: 'Odehrát zápas' }).click();
  await page.getByText('Hráč zápasu').first().waitFor();
  savedDate = await page.locator('.topbar span').nth(2).innerText();
  await page.getByRole('button', { name: 'Uložit / načíst' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Uložit sem' }).first().click();
  await page.getByText('Hra uložena.').waitFor();
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  if (!dbs.includes('fotbalovy-manazer')) throw new Error(`IndexedDB neobsahuje databázi hry (${dbs.join(', ')})`);
});

await check('po obnovení stránky se uložená hra načte', async () => {
  await page.reload();
  await page.getByRole('button', { name: /Pozice 1: Bohemians/ }).click();
  await page.getByRole('heading', { name: 'Další zápas' }).waitFor();
  const date = await page.locator('.topbar span').nth(2).innerText();
  if (date !== savedDate) throw new Error(`datum po načtení ${date}, uloženo ${savedDate}`);
});

await browser.close();
await server?.close();
if (!ok) process.exit(1);
console.log('Sestavená hra funguje pod cestou GitHub Pages.');
