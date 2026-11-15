# Fotbalový manažer CZ

Fotbalový manažer tří nejvyšších českých soutěží (Chance Liga, Chance Národní Liga, ČFL A/B, MSFL – 82 klubů + MOL Cup).
Sportovní a finanční rozhodnutí tvoří jeden celek: co se stane v kabině, je vidět v rozvaze.
Hra běží v prohlížeči na PC, pro jednoho hráče, bez serveru. UI je česky.

Kompletní design: `docs/design.md` (zdroj pravdy). Plán fází je v sekci 16.

## Technologie

TypeScript (strict), React, Vite, Zustand (stav aplikace), Vitest + Testing Library (testy), tsx (TS skripty v Node), Playwright (e2e).
Ukládání: IndexedDB (vlastní tenká vrstva) + export/import JSON. Grafy: Recharts.

## Architektura

```
data/            JSON data: soutěže, kluby, kraje, jména, taktika, pyramid.json (nadstavba, baráž, postupy, pohár), balance.json (laditelné konstanty)
docs/design.md   designový dokument
src/engine/      čistá herní logika – žádný React, DOM ani prohlížečové API; jde spouštět v Node
  players/       generátor hráčů, výpočet TS/FS/CEL z atributů
  match/         zápasový engine (krokovač), známky, vysvětlení asistenta
  lineup.ts      vhodnost pozice, optimální sestava (maďarská metoda), taktika AI
  game/          herní stav (GameState) a smyčka po hracích dnech (advance.ts), kalendář, sestava hráče, statistiky,
                 vývoj hráčů a akademie (development.ts), nadstavba a baráž (postseason.ts), MOL Cup (cup.ts),
                 pravidla pyramidy (pyramid.ts), přechod sezóny (transition.ts), finance (finance.ts), vedení (board.ts), formát uložení
  season.ts      simulace celé sezóny bez manažera (nad stejnou smyčkou jako hra)
src/state/       Zustand store (navigace, akce), IndexedDB úložiště
src/ui/          obrazovky (screens/) a komponenty (React); styles.css, akcentová barva klubu v theme.ts
scripts/         CLI skripty nad enginem (simulace sezóny, zápasu, kalibrace)
tests/           Vitest testy a kalibrační simulace
```

Směr závislostí: `ui → state → engine → data`. Engine nikdy neimportuje z `state` ani `ui`.

## Pravidla

1. **Žádné `Math.random()`.** Veškerá náhoda jde přes `src/engine/rng.ts` (generátor se semínkem).
   Pro nezávislé části používej `rng.fork('popisek')`, aby nová náhodná volba v jednom modulu nepřehodila výsledky jinde.
2. **Žádná magická čísla v kódu.** Konstanty pro vyvažování (síla kádrů, góly, šance, ceny, růst) patří do `data/balance.json`.
3. **Kód anglicky, data a UI česky.** Identifikátory, typy a komentáře v kódu anglicky; názvy klubů, texty UI a hlášky česky.
4. **Data se validují** při načtení (`src/engine/data.ts`) – chyba v JSON musí spadnout hned a srozumitelně.
5. **Každá fáze končí spustitelným stavem:** `npm test` zelený, `npm run typecheck` bez chyb, `npm run e2e` prošel, commit + push.
6. **Změna designu = úprava `docs/design.md`.**
7. Jedna fáze (nebo její část) na jedno zadání; nejdřív plán, pak kód. Nic nad rámec zadané fáze.

## Konvence

- CEL = CA (aktuální schopnost), POT = PA (potenciál). V kódu jen `cel` / `pot`.
- TS, FS ani CEL se neukládají: počítají se z atributů (`players/rating.ts`, váhy v `balance.json → attributes.weights`) a závisí na pozici, na které hráč hraje.
- Stav hráče (kondice, forma, zranění, stopky, žluté karty) je v `player.state`. `playSeason` pracuje na kopii hráčů a vstupní svět nemění.
- `GameState` je čistě serializovatelný (žádné `Map`) a ukládá se celý. Engine ho mění na místě, store pak zvýší `revision`.
- Náhoda v sezóně se odvozuje ze seedu pro každý zápas zvlášť (`fork`), takže načtená hra pokračuje přesně stejně jako neuložená.
- Změna formátu `GameState` = zvýšit `SAVE_VERSION` (`game/state.ts`) a vyřešit načítání starších uložení.
- Věk hráče se počítá z `birthDate` k 1. 7. dané sezóny (pro vývoj přesně k datu, `exactAge`).
- Příslušnost klubů k soutěžím je v `GameState.membership` (mění se postupy a sestupy); `clubs.json → competitionId` je jen start.
- Akademie: hráči s `academy: true` (nehrají seniorské zápasy). Atributy jsou po vývoji desetinná čísla (UI zaokrouhluje).
- Mezipaměť výběru sestav (`runtimeOf(state).selection`) se musí zneplatnit po každé změně atributů nebo kádrů (`invalidateRuntime`), jinak se rozejde uložená a neuložená hra.
- Peníze: každý pohyb jde přes `book()` (finance.ts) – sezónní součty po kategoriích; u klubu hráče i seznam transakcí. Částky v Kč.
- Volní hráči mají `clubId = FREE_AGENT` ('volny-hrac'), bez smlouvy. Hostovaný hráč má `clubId` hostitele a `loan.fromClubId` mateřského klubu (`ownerOf`).
- Trh: `game/market.ts` (hodnota, nabídky, smlouvy, volní hráči, AI trh v oknech – tržní dny v `passTime`), skauting `game/scouting.ts`. Hráč manažera vidí CEL/POT cizích hráčů jen jako odhad (`estimateOf`).
- Kluby mají `id` jako slug (`slavia-praha`, `slavia-praha-b`). B/C týmy mají `parentClubId`.
- Pozice: kódy `GK CB LB RB DM CM AM LM RM LW RW ST`, v UI česky (BR SO LO PO DZ SZ OZ LZ PZ LK PK ÚT).

## Deník rozhodnutí

Rozhodnutí bez explicitního zadání a otevřené otázky se zapisují do `docs/poznamky-implementace.md`.

## Otevřené body (neověřeno)

- Data klubů mají `verified: false`: web FAČR nebyl z vývojového prostředí dostupný. Nejisté údaje jsou v poli `note`.
- Pořadí kritérií tabulky (`data/competitions.json → tiebreakers`) je podle soutěžního řádu FAČR, jak ho známe; ověřit.
- Barvy menších klubů jsou odhad (`note: "barvy odhad"`).
- Kalibrační cíle mimo design (střely, fauly, karty, rohy, zranění, výhry domácích v 1. lize) jsou odhad – statistické weby nebyly z prostředí dostupné. Délky trestů za červené karty jsou odhad.
- Všechny týmy mají kádry generované kolem 4-2-3-1, takže AI ho volí nejčastěji. Pestřejší kádry přijdou s přestupy.
- Kalendář kol (`competitions.json → calendar`: soboty, zimní pauza) je odhad, neověřeno proti FAČR.
- Nadstavba jednokolově (zadání uživatele); play-off 7.–10., baráž na dva zápasy, počty postupujících a rozdělení do skupin 3. ligy podle krajů jsou návrh (`pyramid.json`).
- Pyramida je od 3. ligy dolů uzavřená (zadání uživatele): z 3. ligy se nesestupuje, B-tým, který by musel pod 3. ligu, vypadne ze soutěží.
- Klub hluboko pod svou cílovou silou bez dostupného hráče na trhu podepíše „volného hráče ze zahraničí“ (náhrada trhů mimo hru). B-týmy AI drží hráče do 22 let. 2. a 3. liga za 10 sezón zesílí o ~3 body (`calibrate:world` upozorní, prvních 5 sezón v mezích).
- Čísla trhu a skautingu (`balance.json → transfers`, `scouting`) jsou návrh; termíny oken podle designu, neověřeno proti FAČR.
- Nábor do akademie: POT 70+ má ~6–7 % dorostenců (design: „zhruba každý desátý“) – víc talentu by bez přestupů nafouklo nižší soutěže.

## Příkazy

```bash
npm run dev          # vývojový server
npm test             # testy (Vitest)
npm run typecheck    # kontrola typů
npm run simulate -- --seed 42   # odsimuluje sezónu všech lig a vypíše tabulky
npm run match -- --home slavia-praha --away sparta-praha --seed 1   # jeden zápas s událostmi a známkami
npm run calibrate -- --seasons 1000   # kalibrace proti cílům; cíle z designu musí projít
npm run calibrate:world   # stabilita světa: 8 světů × 10 sezón (prvních 5 přísně, dál jen upozornění)
npm run e2e          # Playwright: nová hra → zápasy → uložení → reload → načtení → 5 sezón (screenshoty v out/screenshots)
```

Lokálně před prvním `npm run e2e`: `npx playwright install chromium`.

Po změně čísel v `balance.json → match` vždy pusť `npm run calibrate` (stačí 100 sezón, na konci fáze 1 000). Po změně vývoje, akademie nebo kádrů pusť `npm run calibrate:world`.

## Stav fází

| Fáze | Obsah | Stav |
| --- | --- | --- |
| 0 | projekt, CLAUDE.md, design, git | hotovo |
| 1 | kluby v JSON, generátor hráčů, rozpis, tabulky, simulace sezóny | hotovo |
| 2 | atributy, taktika, simulace zápasu, známky, zranění a tresty, kalibrace | hotovo |
| 3 | UI (Domů, Soupiska, Profil, Taktika, Zápas, Soutěže, Konec sezóny), kalendář, ukládání – MVP | hotovo |
| 4 | vývoj hráčů, akademie, B-týmy, nadstavba, baráž, MOL Cup, přechod sezóny | hotovo |
| 4b | doplňky z CSM: konce kariér podle pozic, typy zranění a návrat, únava podle věku, varování na 3 žluté, kalibrace penalt | hotovo |
| 5 | ekonomika (finance všech klubů, smlouvy, vstupné, výkazy, úvěr, licence), cíle a hodnocení vedení | hotovo |
| 6 | přestupy a hostování, smlouvy a prodlužování, volní hráči, živý trh AI, skauting a odhady CEL/POT | hotovo |
| 7–8 | viz `docs/design.md`, sekce 16 | – |
