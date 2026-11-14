// End-to-end smoke test of the MVP in Chromium (Playwright; locally first run `npx playwright install chromium`):
// new game -> squad -> tactics -> play matches -> save -> reload -> load -> skip to the season end.
//
//   npm run e2e                 # screenshots go to out/screenshots
//
// Exits with code 1 on the first failed step or on any error in the browser console.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const SHOTS = 'out/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let step = 0;
async function check(name: string, fn: () => Promise<void>) {
  step++;
  const started = Date.now();
  try {
    await fn();
    if (errors.length > 0) throw new Error(`chyba v prohlížeči: ${errors.join(' | ')}`);
    console.log(`✓ ${step}. ${name} (${Date.now() - started} ms)`);
  } catch (e) {
    console.error(`✗ ${step}. ${name}: ${(e as Error).message}`);
    await page.screenshot({ path: `${SHOTS}/failure.png` });
    await browser.close();
    await server.close();
    process.exit(1);
  }
}
const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
  await check('úvodní obrazovka', async () => {
    await page.goto('http://localhost:5188/');
    await page.getByRole('button', { name: 'Nová hra' }).click();
  });

  await check('nová hra: Bohemians Praha 1905', async () => {
    await page.getByLabel('Jméno trenéra').fill('Testovací Trenér');
    await page.getByLabel('Semínko světa', { exact: false }).fill('e2e');
    await shot('01-nova-hra');
    await page.getByRole('button', { name: /Bohemians Praha 1905/ }).click();
    await page.getByRole('button', { name: 'Začít kariéru' }).click();
    await page.getByRole('heading', { name: 'Další zápas' }).waitFor();
    await shot('02-domu');
  });

  await check('soupiska a profil hráče', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Soupiska' }).click();
    await page.getByRole('heading', { name: 'Soupiska' }).waitFor();
    if ((await page.locator('table.data tbody tr').count()) !== 24) throw new Error('kádr nemá 24 hráčů');
    await page.getByRole('columnheader', { name: /CEL/ }).click();
    await shot('03-soupiska');
    await page.locator('table.data tbody tr').first().click();
    await page.getByText('FS – fyzické').waitFor();
    await shot('04-profil');
    await page.getByRole('button', { name: '← Zpět' }).click();
  });

  await check('taktika: výměna hráče a změna rozestavení', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Taktika' }).click();
    const slot = page.getByTestId('slot-10');
    const before = await slot.innerText();
    await slot.click();
    await page.locator('.chips').first().locator('.chip').nth(1).click();
    if ((await slot.innerText()) === before) throw new Error('výměna se neprovedla');
    await page.getByLabel('Rozestavení').selectOption('4-4-2');
    await page.getByLabel('Rozestavení').selectOption('4-3-3');
    await shot('05-taktika');
  });

  await check('zápas mezerníkem a výsledková obrazovka', async () => {
    await page.locator('body').click({ position: { x: 5, y: 880 } });
    await page.keyboard.press('Space');
    await page.getByTestId('score').waitFor();
    await page.getByTestId('explanation').waitFor();
    await shot('06-zapas');
  });

  await check('další dva zápasy tlačítkem Pokračovat', async () => {
    for (let i = 0; i < 2; i++) {
      const score = page.getByTestId('score');
      await page.getByRole('button', { name: /Pokračovat/ }).click();
      await score.waitFor();
    }
    await page.getByRole('navigation').getByRole('button', { name: 'Soutěže' }).click();
    await page.getByText('odehráno 3 z 30 kol').waitFor();
    await shot('07-tabulka');
  });

  let savedDate = '';
  await check('uložení na pozici 1', async () => {
    savedDate = await page.locator('.topbar span').nth(2).innerText();
    await page.getByRole('button', { name: 'Uložit / načíst' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Uložit sem' }).first().click();
    await page.getByText('Hra uložena.').waitFor();
    await shot('08-ulozeni');
  });

  await check('obnovení stránky a načtení', async () => {
    await page.reload();
    await page.getByRole('button', { name: /Pokračovat: Bohemians/ }).waitFor();
    await page.getByRole('button', { name: /Pozice 1: Bohemians/ }).click();
    await page.getByRole('heading', { name: 'Další zápas' }).waitFor();
    const date = await page.locator('.topbar span').nth(2).innerText();
    if (date !== savedDate) throw new Error(`datum po načtení ${date}, uloženo ${savedDate}`);
  });

  await check('přeskočení na konec sezóny', async () => {
    await page.getByRole('button', { name: 'Přeskočit na konec sezóny' }).click();
    await page.getByTestId('final-position').waitFor({ timeout: 60_000 });
    await shot('09-konec-sezony');
    await page.getByRole('button', { name: 'Konečné tabulky' }).click();
    await page.getByText('odehráno 30 z 30 kol').waitFor();
    await shot('10-konecna-tabulka');
  });

  await check('po konci sezóny se automaticky uložilo', async () => {
    await page.reload();
    await page.getByRole('button', { name: /Pokračovat: Bohemians/ }).click();
    await page.getByTestId('final-position').waitFor();
  });
} finally {
  await browser.close();
  await server.close();
}
console.log(`\nE2E: všech ${step} kroků prošlo. Screenshoty: ${SHOTS}/`);
