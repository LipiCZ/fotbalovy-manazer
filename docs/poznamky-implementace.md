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

## Fáze 6 – přestupy, smlouvy, skauting

- **Všechna čísla trhu jsou návrh** (`balance.json → transfers`, `scouting`), podrobně v designu (sekce 6 a 8, „Doplněno ve fázi 6“). Laděno na stabilní svět: `calibrate:world` – síla lig za 5 sezón v mezích (1. liga +0,5, 2. +1,9, 3. +1,6), kádry 19–27, hospodaření v mezích.
- **AI kupuje jen pod svou cílovou silou.** Bez toho se nižší soutěže rychle vyrovnávaly (silnější slabé týmy → méně gólů ve 3. lize). Klub, který je hluboko pod cílem a nic si nemůže dovolit, podepíše „volného hráče ze zahraničí“ – náhrada za trhy, které hra nesimuluje (dřívější dočasné „kotvení“ z fáze 4 je tím nahrazené).
- **Konec smlouvy**: hráči manažera bez prodloužení odcházejí zadarmo. Pojistka: když by kádr (A i B) klesl pod minimum soutěže, asistent prodlouží nejlepším o rok a napíše to do novinek. Upozornění na končící smlouvy je celou sezónu na Domů („K rozhodnutí“).
- **Odhady**: vlastní hráči CEL přesně, POT ±3 (dřív přesně); 1. liga ±10, 2. liga ±14, ostatní neznámí bez skauta. Atributy cizích hráčů se ukážou jen při přesnosti aspoň ±10.
- **Účetnictví přestupů**: prodej = výnos (nepeněžní) + pohledávka, peníze chodí ve splátkách („Prodej hráčů (příjmy)“ v peněžních tocích). Nákup: platby jsou investiční tok, aktivovaná registrace se odepisuje měsíčně.
- **Zjednodušení**: AI-AI hostování není; AI kluby mladé jen nabízejí manažerovi. Nabídky AI na hráče manažera chodí jen v okně (design říká „kdykoli“ – mimo okno by stejně jen čekaly). Bez zpětného odkupu, práva dorovnat, bonusů, finančního ředitele a poptávek.
- **Otevřené otázky**: (1) Mají AI kluby smět kupovat i mimo svou nejslabší pozici (např. investice do talentů)? (2) Má mít manažer limit kádru (např. 30 seniorů)? Teď ho hlídá jen rozpočet. (3) Rozpočet na přestupy od vedení se zatím jen ukazuje, nevynucuje – má překročení snížit hodnocení vedení?

## Fáze 7 – stadion, město, investor, vztahy, média

- **Malé dopady záměrně** (design: „čísla mění jen málo“): kabina ±3 % síly, fanoušci ±10 % návštěvy. Kalibrace zápasů ani světa se nemění (vliv má jen tým hráče).
- **Stadion jen u klubu hráče.** AI kluby licenci stadionu neřeší; postoupivší AI klub hraje doma bez omezení.
- **Dotace města se účtuje čistou metodou**: snižuje pořizovací cenu stadionu (v aktivech je jen část placená klubem). IFRS (IAS 20) to dovoluje; podle českých předpisů se, pokud vím, investiční dotace o pořizovací cenu majetku také snižuje – **ověřit** (nemám zdroj z prostředí).
- **Investor**: zjednodušeně jen vklad, změna právní formy a přísnější cíl ligy; bez podílu na zisku a bez odchodu investora. Spolek dostane nabídku jen po postupu (návrh), „vyšší reputace“ z designu zatím není (reputace chybí).
- **Kapitán**: tlumí jen propady nálady kabiny. „Propady formy“ by znamenaly měnit známky, ze kterých se počítá vývoj, proto zatím ne.
- **Texty** (titulky, sociální sítě, události) jsou vlastní, bez reálných médií a osob. České skloňování názvů klubů hra neumí, šablony jsou proto psané tak, aby název stál v 1. pádě.
- **Otevřené otázky**: (1) Má vedení podle svého vztahu měnit rozpočet (design, tabulka v sekci 14)? Zatím jen ukazuje průběžné hodnocení. (2) Mají se rozlišovat typy majitelů (město, podnikatel, bohatý majitel)? (3) Ceny vstupenek (permanentka, derby, pohár) z designu jsou zatím jedna cena.

## Fáze 8 – živý zápas, kariéra trenéra, ceny sezóny, ladění

- **Živý zápas** je rozdělený hrací den: ostatní zápasy dne se odehrají hned, zápas hráče až po živém přenosu. Výsledky jsou stejné jako v rychlém režimu (test), pořadí v tabulce pro návštěvu se proto bere před zápasem (dřív po něm – nepatrná změna i v rychlém režimu).
- **Kariéra je výchozí režim** nové hry (design: hlavní režim); volný výběr je druhá záložka. Uložení z dřívějších verzí se převedou na volný výběr.
- **Reputace trenéra zatím neovlivňuje** hráče ani vedení, jen nabídky klubů. Konec kariéry trenéra (nikdo ho nechce) hra nezná – po vyhazovu vždy přijdou aspoň nabídky ze 3. ligy.
- **Ceny sezóny** se počítají jen z dat, která hra uchovává: góly a karty z mých zápasů (u ostatních se události neukládají), známky celé soutěže.
- **Ladění**: kalibrace zápasů 300 sezón – 9/9 cílů z designu, 0 odhadů mimo rozsah; kalibrace světa (po fázi 6) – prvních 5 sezón v mezích.
- **Otevřené otázky**: (1) Má reputace trenéra ovlivnit ochotu hráčů přestoupit nebo cíle vedení? (2) Má mít kariéra konec (bez nabídek) nebo možnost odpočinku? (3) Mají se ukládat události všech zápasů, aby gól sezóny byl z celé ligy (větší uložení)?

## Rozhodnutí uživatele po fázi 8

- Finance = třetí cíl vedení s menší vahou (0,4; liga 1,0, pohár 0,6/0,2). Cíl „ztráta nejvýš 5 % příjmů“ a převod na stupně jsou návrh. Stará uložení dostanou finanční cíl od další sezóny.
- Rozpočet na přestupy zůstává orientační; vztahy rozpočet nemění.
- Limit A-týmu manažera 30 hráčů (`squads.userMax`).
- Ochota hráče přijít: jen sportový úspěch a ambice (atraktivita klubu). Platí i pro AI trh. Aby svět zůstal stabilní, AI kupuje až 2 body pod cílovou silou (dřív 1,5).
- Kariéra nekončí; události zápasů se dál neukládají (stačí sezónní statistiky).
- Vstupné: jedna cena pro česká mistrovská utkání; evropské poháry (dražší, víc diváků) až s poháry.
