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
    await page.getByText('Nabídky').waitFor();
    await shot('01-nova-hra-kariera');
    await page.getByRole('button', { name: 'Volný výběr' }).click();
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
  await check('živý zápas: běží, střídání, dohrát', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Domů' }).click();
    await page.getByRole('button', { name: 'Hrát živě' }).click();
    await page.getByTestId('live-score').waitFor();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Pauza|^Pokračovat/ }).first().waitFor();
    await shot('05b-zivy-zapas');
    await page.getByRole('button', { name: /Dohrát rychle|Výsledek zápasu/ }).click();
    await page.getByText('Hráč zápasu').first().waitFor();
  });

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
    await page.getByRole('navigation').getByRole('button', { name: 'Soutěže' }).click();
    await page.getByRole('button', { name: 'Nadstavba a baráž' }).click();
    await page.getByRole('heading', { name: 'Skupina o titul' }).waitFor();
    await shot('11-nadstavba');
    await page.getByRole('button', { name: 'MOL Cup' }).click();
    await page.getByText(/MOL Cup vyhrál/).waitFor();
    await shot('12-mol-cup');
  });

  await check('finance: výkazy, graf a cíle vedení', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Finance' }).click();
    await page.getByRole('heading', { name: 'Výsledovka sezóny (zjednodušená)' }).waitFor();
    await page.getByLabel('graf peněz').locator('svg').first().waitFor();
    await shot('16-finance');
    await page.getByRole('navigation').getByRole('button', { name: 'Konec sezóny' }).click();
    await page.getByRole('heading', { name: 'Hodnocení vedení' }).waitFor();
  });

  await check('nová sezóna a přesun dorostence do A-týmu', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Konec sezóny' }).click();
    await page.getByRole('button', { name: /Začít sezónu 2027\/28/ }).click();
    await page.locator('.topbar').getByText('Sezóna 2027/28').waitFor();
    await page.getByRole('navigation').getByRole('button', { name: 'Soupiska' }).click();
    const aTab = page.getByRole('button', { name: /^A-tým \(\d+\)$/ });
    const before = Number((await aTab.innerText()).match(/\d+/)![0]);
    await page.getByRole('button', { name: /^Mládež \(\d+\)$/ }).click();
    await shot('13-mladez');
    await page.getByRole('button', { name: '→ A-tým' }).first().click();
    const after = Number((await aTab.innerText()).match(/\d+/)![0]);
    if (after !== before + 1) throw new Error(`A-tým měl ${before}, po přesunu ${after}`);
  });

  await check('přestupy: volný hráč podepsán, skaut najat', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Přestupy' }).click();
    await page.getByText('Přestupní okno je otevřené (letní).').waitFor();
    await page.getByRole('button', { name: 'Hledat hráče' }).click();
    await page.locator('table.data tbody tr').first().waitFor();
    await shot('17-prestupy');
    await page.getByRole('button', { name: 'Volní hráči' }).click();
    await page.locator('table.data tbody tr button.link').first().click();
    await page.getByRole('heading', { name: 'Smlouva a přestupy' }).waitFor();
    await page.getByRole('button', { name: 'Podepsat', exact: true }).click();
    await page.getByText(/podepsal smlouvu/).waitFor();
    await shot('18-podpis-volneho-hrace');
    await page.getByRole('navigation').getByRole('button', { name: 'Skauting' }).click();
    await page.getByRole('button', { name: 'Najmout' }).first().click();
    await page.getByLabel(/úkol skauta/).first().selectOption({ index: 2 });
    await shot('19-skauting');
  });

  await check('klub: vztahy, stadion, média', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Klub' }).click();
    await page.getByRole('heading', { name: 'Vztahy' }).waitFor();
    await page.getByRole('heading', { name: 'Stadion' }).waitFor();
    await page.getByLabel('náhodné události').selectOption('často');
    const decision = page.getByTestId('club-decisions').getByRole('button').first();
    if (await decision.count()) await decision.click();
    await shot('20-klub');
  });

  for (const year of [2027, 2028, 2029, 2030]) {
    await check(`sezóna ${year}/${String(year + 1).slice(2)} až do konce`, async () => {
      // After a sacking the manager must take a new job first.
      if (await page.getByText('Vedení tě odvolalo – vyber nové angažmá').count()) {
        await page.getByRole('navigation').getByRole('button', { name: 'Kariéra' }).click();
        await page.getByTestId('job-offers').getByRole('button', { name: 'Přijmout' }).first().click();
      }
      await page.getByRole('button', { name: 'Přeskočit na konec sezóny' }).click();
      await page.getByTestId('final-position').waitFor({ timeout: 90_000 });
      if (year < 2030) {
        await page.getByRole('button', { name: new RegExp(`Začít sezónu ${year + 1}/${String(year + 2).slice(2)}`) }).click();
        await page.locator('.topbar').getByText(`Sezóna ${year + 1}/${String(year + 2).slice(2)}`).waitFor();
      }
    });
  }

  await check('ceny sezóny a kariéra trenéra', async () => {
    await page.getByTestId('awards').waitFor();
    await shot('21-ceny-sezony');
    await page.getByRole('navigation').getByRole('button', { name: 'Kariéra' }).click();
    await page.getByTestId('reputation').waitFor();
    await shot('22-kariera');
    await page.getByRole('navigation').getByRole('button', { name: 'Konec sezóny' }).click();
  });

  await check('po 5 sezónách: historie, graf vývoje hráče', async () => {
    await page.getByRole('heading', { name: 'Moje sezóny' }).waitFor();
    const rows = await page.getByRole('heading', { name: 'Moje sezóny' }).locator('..').locator('tbody tr').count();
    if (rows !== 4) throw new Error(`v historii je ${rows} sezón (čekáno 4 dokončené + aktuální na obrazovce)`);
    await shot('14-konec-5-sezony');
    await page.getByRole('navigation').getByRole('button', { name: 'Soupiska' }).click();
    await page.locator('table.data tbody tr').first().click();
    await page.getByLabel('graf vývoje CEL').locator('svg').first().waitFor();
    await page.getByRole('heading', { name: 'Kariéra' }).waitFor();
    await shot('15-profil-vyvoj');
  });
} finally {
  await browser.close();
  await server.close();
}
console.log(`\nE2E: všech ${step} kroků prošlo. Screenshoty: ${SHOTS}/`);
