# Poznámky k implementaci

Deník rozhodnutí, která padla během implementace bez explicitního zadání, a otevřených otázek pro autora designu.
Každá položka: co jsem rozhodl, proč, a kde se to dá změnit.

## Fáze 4b – doplňky inspirované CSM

- **Konec kariéry** podle tabulky ze zadání (pozice, věk) a násobičů. Skupiny pozic: obránci = SO, LO, PO; záložníci = DZ, SZ, OZ, LZ, PZ; útočníci = LK, PK, ÚT (`balance.json → retirement.positionGroups`). „Vysoká profesionalita“ = skrytý atribut ≥ 75 (návrh). Pravidlo „slabší hráči končí dřív“ z fáze 4 je zrušené.
  - Dopad: průměrný věk seniorů ve světě stoupl o ~1 rok (25,3 → 26,4) a pak se ustálil; síla lig za 5 sezón v mezích.
- **Zranění**: typy lehké / střední / těžké / velmi těžké se zadanými délkami; váhy 55 / 30 / 12 / 3 % (návrh). Zranění z tréninku je vždy lehké. Po návratu: kondice nejvýš 75 %, 3 zápasy forma horší o 0,3 bodu známky, 28 dní dvojnásobné riziko nového zranění (vše návrh, `injuries.afterReturn`).
- **Únava podle věku**: úbytek kondice ×1,0 do 29 let, ×1,04 ve 32, ×1,1 ve 35, ×1,15 v 38 (návrh, mírné – výdrž od 32 let klesá už vývojem).
- **Žluté karty**: hráč s 3 žlutými (obecně „jedna do stopky“) dostane v Novinkách upozornění a v soupisce ⚠.
- **Penalty**: kalibrace hlídá proměňování 74–80 % (cíl 77 %); naměřeno 77,5 %.
- **Neověřeno**: pravidla FAČR pro žluté v nadstavbě a v poháru (viz design, sekce 12). Příprava v `discipline.postseason` a `discipline.cupSeparateCount`, zatím vypnuto.

## Fáze 5 – ekonomika a vedení

- **Všechna čísla ekonomiky jsou herní odhad** (`balance.json → economy`), laděný na vyrovnané hospodaření: typický klub ±10 % příjmů, platy ~55 % příjmů. Měřítko (mil. Kč ročně, průměr): 1. liga velikost 3 ~110, velikost 5 ~290; 2. liga ~12–30; 3. liga ~1,5–3.
- **Kapacity stadionů** jsou odhad podle úrovně a velikosti klubu, ne skutečné kapacity (Slavia ~19 000, malé kluby 3. ligy ~1 000). Stadion s úrovněmi přijde ve fázi 7.
- **Velké kluby platí víc** za stejnou kvalitu (násobič 0,8–1,7 podle velikosti), jinak by měly stovky milionů zisku.
- **Sestupová klauzule** (plat −30 % po sestupu) je můj návrh – bez ní sestoupivší kluby prodělávaly ~60 % příjmů ročně.
- **Smlouvy** se do fáze 6 prodlužují automaticky. Žádné vyjednávání, žádné odchody zadarmo.
- **Licence**: k 31. 5. nesmí mít klub hráče záporný stav peněz, jinak −3 body v příští sezóně (počet je návrh).
- **Cíle vedení**: favorit (1.–2. nejsilnější kádr) má cíl o 1 místo horší než své pořadí, ostatní o 2 místa. Pohár: index kola podle úrovně a velikosti (`board.goals`). Převod umístění na stupně a váhy poháru jsou návrh (`board`).
- **Otevřená otázka**: má být finanční výsledek třetím cílem vedení? (design, sekce 13 a 14 o tom mluví; zadání zná jen ligu a pohár).
