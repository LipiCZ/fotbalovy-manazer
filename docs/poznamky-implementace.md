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
