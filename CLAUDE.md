# Fotbalový manažer CZ

Fotbalový manažer tří nejvyšších českých soutěží (Chance Liga, Chance Národní Liga, ČFL A/B, MSFL – 82 klubů + MOL Cup).
Sportovní a finanční rozhodnutí tvoří jeden celek: co se stane v kabině, je vidět v rozvaze.
Hra běží v prohlížeči na PC, pro jednoho hráče, bez serveru. UI je česky.

Kompletní design: `docs/design.md` (zdroj pravdy). Plán fází je v sekci 16.

## Technologie

TypeScript (strict), React, Vite, Vitest, tsx (spouštění TS skriptů v Node).
Později: Zustand (stav), Recharts (grafy), IndexedDB + export/import JSON (ukládání). Zatím nejsou nainstalované.

## Architektura

```
data/            JSON data: soutěže, kluby, kraje, jména, balance.json (laditelné konstanty)
docs/design.md   designový dokument
src/engine/      čistá herní logika – žádný React, DOM ani prohlížečové API; jde spouštět v Node
  players/       generátor hráčů, výpočet TS/FS/CEL z atributů
  match/         zápasový engine (krokovač), známky, vysvětlení asistenta
  lineup.ts      vhodnost pozice, optimální sestava (maďarská metoda), taktika AI
  season.ts      sezóna kolo po kole, stav hráčů mezi koly
src/state/       stav hry a ukládání (zatím prázdné)
src/ui/          obrazovky a komponenty (React)
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
5. **Každá fáze končí spustitelným stavem:** `npm test` zelený, `npm run typecheck` bez chyb, commit + push.
6. **Změna designu = úprava `docs/design.md`.**
7. Jedna fáze (nebo její část) na jedno zadání; nejdřív plán, pak kód. Nic nad rámec zadané fáze.

## Konvence

- CEL = CA (aktuální schopnost), POT = PA (potenciál). V kódu jen `cel` / `pot`.
- TS, FS ani CEL se neukládají: počítají se z atributů (`players/rating.ts`, váhy v `balance.json → attributes.weights`) a závisí na pozici, na které hráč hraje.
- Stav hráče (kondice, forma, zranění, stopky, žluté karty) je v `player.state`. `playSeason` pracuje na kopii hráčů a vstupní svět nemění.
- Věk hráče se počítá z `birthDate` k 1. 7. dané sezóny.
- Kluby mají `id` jako slug (`slavia-praha`, `slavia-praha-b`). B/C týmy mají `parentClubId`.
- Pozice: kódy `GK CB LB RB DM CM AM LM RM LW RW ST`, v UI česky (BR SO LO PO DZ SZ OZ LZ PZ LK PK ÚT).

## Otevřené body (neověřeno)

- Data klubů mají `verified: false`: web FAČR nebyl z vývojového prostředí dostupný. Nejisté údaje jsou v poli `note`.
- Pořadí kritérií tabulky (`data/competitions.json → tiebreakers`) je podle soutěžního řádu FAČR, jak ho známe; ověřit.
- Barvy menších klubů jsou odhad (`note: "barvy odhad"`).
- Kalibrační cíle mimo design (střely, fauly, karty, rohy, zranění, výhry domácích v 1. lize) jsou odhad – statistické weby nebyly z prostředí dostupné. Délky trestů za červené karty jsou odhad.
- Všechny týmy mají kádry generované kolem 4-2-3-1, takže AI ho volí nejčastěji. Pestřejší kádry přijdou s přestupy.

## Příkazy

```bash
npm run dev          # vývojový server
npm test             # testy (Vitest)
npm run typecheck    # kontrola typů
npm run simulate -- --seed 42   # odsimuluje sezónu všech lig a vypíše tabulky
npm run match -- --home slavia-praha --away sparta-praha --seed 1   # jeden zápas s událostmi a známkami
npm run calibrate -- --seasons 1000   # kalibrace proti cílům; cíle z designu musí projít
```

Po změně čísel v `balance.json → match` vždy pusť `npm run calibrate` (stačí 100 sezón, na konci fáze 1 000).

## Stav fází

| Fáze | Obsah | Stav |
| --- | --- | --- |
| 0 | projekt, CLAUDE.md, design, git | hotovo |
| 1 | kluby v JSON, generátor hráčů, rozpis, tabulky, simulace sezóny | hotovo |
| 2 | atributy, taktika, simulace zápasu, známky, zranění a tresty, kalibrace | hotovo |
| 3–8 | viz `docs/design.md`, sekce 16 | – |
