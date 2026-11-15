# Fotbalový manažer CZ – designový dokument

Nov 14, 2026 · @Matěj

## 1. Vize a pilíře

Fotbalový manažer českých soutěží, kde sportovní a finanční rozhodnutí tvoří jeden celek: co se stane v kabině, je vidět v rozvaze. Hra je v prohlížeči, pro jednoho hráče, s ukládáním na disk a bez serveru.

**Pracovní název:** Fotbalový manažer CZ (název „Football Manager“ je ochranná známka jiné hry, proto jen podobný).

**Pilíře**

1. **Ekonomika je stejně důležitá jako taktika.** Klub může zkrachovat i s dobrými výsledky. Na konci sezóny dostaneš výsledovku, rozvahu a cash flow v čitelné podobě.
2. **Hloubka bez mikromanagementu.** Každé rozhodnutí má viditelný dopad. Opakující se úkoly jdou delegovat. Žádný balast jako ve FIFA kariéře.
3. **Transparentnost.** Hra vždy vysvětlí, proč se něco stalo (únava, forma, taktika).
4. **Upravitelná data.** Ligy, kluby a hráči jsou v otevřených JSON souborech.
5. **Humor.** Tiskovky, sponzoři, fanoušci a „ceny sezóny“, ale čísla pod tím sedí.

**Licence:** reálné názvy klubů ano (soukromý projekt), loga ne, hráči fiktivní. Rozpočty klubů jsou odhad podle velikosti klubu, ne reálná čísla.

## 2. Svět hry

Hra začíná se skutečným složením tří nejvyšších českých soutěží v sezóně 2026/27: 82 klubů, plus MOL Cup.

| Úroveň | Soutěž | Týmy |
| --- | --- | --- |
| 1 | Chance Liga (16) | Slavia Praha, Sparta Praha, Viktoria Plzeň, Baník Ostrava, Slovan Liberec, Hradec Králové, Jablonec, Sigma Olomouc, Pardubice, Mladá Boleslav, Bohemians Praha 1905, Teplice, Slovácko, Zlín, Zbrojovka Brno, Artis Brno |
| 2 | Chance Národní Liga (16) | Karviná, Dukla Praha, Táborsko, Opava, Viktoria Žižkov, Příbram, Ústí nad Labem, Vysočina Jihlava, Prostějov, Vlašim, Třinec, Kladno, Arsenal Česká Lípa, Hanacká Slavia Kroměříž, Baník Ostrava B, Slavia Praha B |
| 3 | ČFL A (16) | Králův Dvůr, Viktoria Plzeň B, České Budějovice, Jiskra Domažlice, Motorlet Praha, Loko Praha, Sparta Praha B, FC Písek, SK Benešov, Slavia Praha C, Bohemians 1905 B, Příbram B, Admira Praha, Dukla Praha B, Aritma Praha, Povltavská FA |
| 3 | ČFL B (16) | Mladá Boleslav B, Jablonec B, SK Zápy, Benátky nad Jizerou, Pardubice B, Neratovice-Byškovice, Varnsdorf, Baník Most-Souš, Hradec Králové B, Slovan Liberec B, Čáslav, Chrudim, Sokol Brožány, Teplice B, Horní Ředice, Velké Hamry |
| 3 | MSFL (18) | Artis Brno B, Zbrojovka Brno B, Blansko, Frýdek-Místek, Havířov, Hlubina, Hodonín, Karviná B, Nové Město na Moravě, Polanka nad Odrou, Sigma Olomouc B, Hranice, Slovácko B, Uherský Brod, Uničov, Vítkovice, Vsetín, Zlín B |

Seznamy 2. a 3. ligy jsou ze statistických webů. Před tvorbou datových souborů je ověříme proti FAČR.

**Formát 1. ligy:** 30 kol, pak nadstavba. Prvních 6 hraje skupinu o titul, 7.–10. play-off o umístění, zbytek o záchranu. 16. tým sestupuje přímo, 14. a 15. hrají baráž s 2. a 3. týmem 2. ligy. Vítěz 2. ligy postupuje přímo.

**B-týmy:** nemohou postoupit do soutěže svého A-týmu ani do 1. ligy. Velké kluby mají B-tým ve 2. nebo 3. lize, menší kluby v divizi nebo krajském přeboru. Nižší soutěže se nesimulují zápas po zápasu, jen jako zjednodušené výsledky a statistiky.

**Doplněno ve fázi 4 (implementace):** nadstavba 1. ligy se hraje v obou skupinách **každý s každým jednou** (5 kol), body ze základní části se přenáší. Play-off o 7. místo: semifinále 7.–10. a 8.–9. u lépe umístěného, vítězové hrají o 7. místo. Baráž: 14. a 15. z 1. ligy proti 2. a 3. způsobilému týmu 2. ligy, dva zápasy (první doma tým 2. ligy), rozhoduje součet, pak prodloužení a penalty. Ze 2. ligy sestupuje tolik týmů, kolik postoupí ze 3. ligy (vítěz každé skupiny, B-tým jen pokud smí). **Pyramida je zatím od 3. ligy dolů uzavřená:** z ČFL ani MSFL se nesestupuje; sestupující ze 2. ligy jdou do skupiny podle kraje (Středočeský kraj a Vysočina vyrovnávají velikosti skupin). B-tým, který by musel pod 3. ligu, ze soutěží vypadne. Nižší soutěže mohou přibýt později.

**MOL Cup:** jako ve skutečnosti. Jedno vyřazovací utkání, v úvodních kolech hraje doma tým z nižší soutěže, kluby z evropských pohárů vstupují později. Finále je v květnu. Vítěz má jistou minimálně hlavní fázi Konferenční ligy. Pro klub ze 3. ligy je to šance na velký zápas a mimořádný příjem.

## 3. Herní smyčka a kalendář

Hra hráče zastaví jen tehdy, když potřebuje rozhodnutí. Tlačítko Pokračovat posune čas na další zápas, rozhodnutí nebo termín. Tlačítko Přeskočit do… skočí na konec okna, další zápas nebo konec sezóny.

**Týden:** pondělí regenerace a souhrn zranění, úterý až čtvrtek trénink, pátek sestava (asistent ji předvyplní), víkend zápas, občas středa pohár. Ve 3. lize se hraje hlavně o víkendech.

**Trénink:** není hlavní náplň hry. Jedno jednoduché rozhodnutí: intenzita (lehká, normální, tvrdá). Tvrdší trénink zvyšuje kondici a růst, ale i únavu a riziko zranění.

**Pošta má tři úrovně:** Rozhodni (nabídky, smlouvy, město), Ke čtení (zranění, vývoj, skauti), Souhrn (vše ostatní v jednom týdenním reportu). Mimo přestupní okna typicky nejvýš 2–3 rozhodnutí týdně.

**Delegování:** asistent může převzít trénink, sestavu v poháru proti slabším, smlouvy dorostenců, přátelské zápasy a tiskovky. Jeho kvalita ovlivňuje výsledek.

**B-tým a mládež:** hráč je neovládá, jen sleduje. Vidí soupisku, hodnocení hráčů, statistiky a známky ze zápasů. Kohokoli může vytáhnout do A-týmu nebo poslat zpět.

| Období | Co se děje |
| --- | --- |
| 1. 7. | nový rok: konce smluv (30. 6.), otevření přestupního okna, rozpočet, cíle vedení, nábor do akademie |
| červenec | příprava, soustředění, přátelské zápasy |
| konec července | start ligy |
| začátek září | konec letního okna; hráči v posledním roce smlouvy smí jednat s jinými kluby |
| podzim | liga, MOL Cup, skautské tipy |
| prosinec | zimní pauza, půlroční hodnocení od vedení |
| leden | zimní okno, soustředění, nábor do akademie |
| únor–duben | jaro, boj o postup nebo záchranu |
| květen | nadstavba, finále MOL Cupu, baráže |
| červen | sezónní report: výkazy, vývoj hráčů, reputace, ceny sezóny |

**Doplněno ve fázi 3 (implementace):**

- **Kalendář:** ligová kola se hrají v sobotu. 1. liga od konce července se zimní pauzou zhruba 14. 12. – 5. 2., nižší soutěže od začátku srpna se zimní pauzou do konce února nebo začátku března. MSFL (34 kol) končí v červnu. Termíny jsou odhad, neověřeno proti FAČR.
- **Pokračovat** (i mezerník) odehraje všechny hrací dny až po další zápas mého týmu a ukáže jeho výsledek. **Přeskočit na konec sezóny** dohraje zbytek sezóny; sestavy přitom vybírá asistent podle mé taktiky, protože hráč nemůže reagovat.
- **Sestava:** zraněné a vyloučené hráče asistent před zápasem nahradí vždy a napíše to do Novinek. Přepínač „sestavu vybírá asistent“ deleguje výběr celé sestavy (styl, nastavení a presink zůstávají moje).
- **Ukládání:** automatické uložení po každém zápase + 3 ruční pozice v prohlížeči (IndexedDB), export a import JSON souboru. Uložení s jinou verzí herních dat se načte s varováním.
- **MVP zjednodušení:** jen volný výběr klubu (kariéra od dna je ve fázi 8), B a C týmy vést nejde. POT vlastních hráčů je vidět přesně (od fáze 6 jako odhad podle skautů). Na výsledkové obrazovce je zatím jen město, stadion s kapacitou a návštěvou přijde s modelem vstupného a stadionu. Pošta, peníze v horní liště a cíl vedení přijdou s ekonomikou.

## 4. Zápas

Zápas má dva režimy. Minutový přenos minutu po minutě není potřeba.

| Režim | Co hráč vidí | Co může dělat |
| --- | --- | --- |
| Rychlý | výsledek, souhrn událostí, známky hráčů | nic, všechny změny dělá asistent |
| Živě | běžící minuty (1 herní minuta = 0,5 s, zápas zhruba 45 s), důležité momenty, statistiky v reálném čase | měnit taktiku, sestavu a střídat kdykoli |

**Důležité momenty:** gól a asistence, velká šance, penalta, karta, zranění. Při gólu, zranění a v poločase se hra sama pozastaví.

**Statistiky:** střely a střely na bránu, xG, držení míče, fauly, karty, rohy, známky hráčů (1–10).

**Doplněno ve fázi 8 (implementace):** živý režim spouští „Hrát živě“ na Domů. Rychlost 1× (0,5 s na minutu), 2,5× a 8×; hra se sama zastaví při gólu, zranění, vyloučení a v poločase. Střídání (konkrétní hráč za konkrétního), nastavení týmu, styl a presink jde měnit kdykoli; po změně taktiky asistent u týmu hráče přestane sám měnit nastavení. „Dohrát rychle“ dosimuluje zbytek. Bez zásahu dopadne živý zápas stejně jako rychlý (stejné náhodné proudy). Hrací den rozdělaný živým zápasem se neukládá. Statistiky během zápasu: střely, na bránu, xG, držení míče; sestava s kondicí.

**Obrazovka výsledku:** inspirace Czech Soccer Managerem. Nahoře týmy a skóre, uprostřed stadion s místem zápasu a návštěvou ve tvaru 6 752 (10 000), po stranách střelci s minutami. Navíc oproti CSM: xG, klíčové statistiky a hráč zápasu.

## 5. Rozvoj hráčů a mládež

Růst určuje věk, minuty a hlavně forma. Potenciál je očekávání, ne strop. Talent s PA 75+, který hraje a daří se mu aspoň průměrně, je do 4 sezón jasná volba do základní 11 průměrného prvoligového týmu.

**Dvě čísla (škála 1–100):** aktuální schopnost (CA) a potenciál (PA, skrytý). Orientace: hráč 3. ligy 45–55, kapitán průměrného prvoligového týmu kolem 68, opora Slavie nebo Sparty 75–80. Hráč s dvěma mimořádnými sezónami může PA překonat až o 8.

**Měsíční růst:**

```latex
\text{růst} = \text{věkový základ} \times \text{minuty} \times \text{forma} \times \text{trénink} \times \text{osobnost}
```

**Minuty:** nejrychleji hráč roste na úrovni mírně nad svou CA. Na lavičce A-týmu skoro neroste.

| Průměrná známka (posledních 10 zápasů) | Násobič růstu |
| --- | --- |
| 7,5 a víc | 1,6 |
| 6,8–7,4 | 1,2 |
| 6,3–6,7 | 1,0 |
| 5,8–6,2 | 0,6 |
| pod 5,8 | 0,3 |

**Sebevědomí:** skrytý stav podle sérií. Hráč v laufu hraje ještě lép. Když se někomu nedáří 1,5 sezóny, růst se zastaví. Pomoct může hostování, jiná role nebo jiný trenér.

**Adaptace:** skrytý atribut, jak rychle si hráč zvykne na dospělý fotbal. Někdo v 17 naskočí do 3. ligy a hned válí, jiný potřebuje rok a půl.

| Věk | Vývoj |
| --- | --- |
| 17–22 | rychlý růst (16–19 let až +8 za sezónu) |
| 23–26 | pomalejší růst |
| 27–31 | vrchol, s formou může přidat |
| 32–34 | klesá rychlost a výdrž, čtení hry a vůdcovství může růst |
| 35+ | výraznější pokles |

**Příklad:** talent v 17 letech s CA 46 a PA 76. B-tým +7, hostování ve 2. lize +6, střídající hráč v A-týmu +5, pak základní sestava. Ve 21 letech má CA kolem 70–72, s nadprůměrnou formou 75+.

**Nábor do akademie:** dvakrát ročně, v lednu a v červenci (zadání uživatele), celkem 5–10 dorostenců za rok (2–5 v každém náboru).

**Doplněno ve fázi 4 (implementace):** vývoj běží každý měsíc. Podíl minut se počítá mírně (podíl^0,6), aby střídající hráč rostl i díky tréninku s lepšími. Scénář výše vychází: s průměrnou formou +7 / +7 / +5 / +5 a CEL ~69–70 ve 21 letech, s formou 6,8–7,4 kolem 72, s formou 7,5+ 75+ (u POT 76). Nenaplněný potenciál od 23 let slábne (mezera POT − CEL se každý rok zmenší o 30 %). Talent je soustředěný do akademií velkých klubů; POT 70+ má ~6–7 % dorostenců, POT 78+ přibude ~5× za rok, POT 85+ zhruba jednou za 2 roky. Konce kariér od ~31 let, slabší hráči dřív. Intenzita tréninku: lehký (růst ×0,85, rychlejší regenerace, bez zranění), normální, tvrdý (růst ×1,15, pomalejší regenerace, víc zranění); výchozí volí asistent podle programu. Do fáze 6 (přestupy) AI kluby přesouvají hráče mezi akademií, B-týmem a A-týmem, a když klesnou hluboko pod svou cílovou sílu, podepíší volného hráče.

Kvalita náboru závisí na úrovni akademie, regionu a reputaci klubu (zatím jen podle velikosti klubu a úrovně soutěže; úroveň akademie a reputace přijdou ve fázi 7). PA nad 70 má zhruba jeden z deseti.

**Konec kariéry** (doplněk inspirovaný CSM; implementace: tabulka a násobiče z dostupných údajů ve **fázi 4b**, smlouva, volní hráči a odchod do nižší soutěže ve **fázi 6**, ohlášení poslední sezóny v **fázi 7**, nabídka práce v klubu ve **fázi 6**). Kontrola proběhne na konci sezóny. Základní šance podle věku a pozice (pozice podle hlavní pozice hráče: obránce = SO, LO, PO; záložník = DZ, SZ, OZ, LZ, PZ; útočník = LK, PK, ÚT):

| Věk | Brankář | Obránce | Záložník | Útočník |
| --- | --- | --- | --- | --- |
| 33 | – | – | 10 % | 15 % |
| 34 | – | 10 % | 20 % | 25 % |
| 35 | – | 20 % | 35 % | 40 % |
| 36 | – | 35 % | 55 % | 60 % |
| 37 | 15 % | 55 % | 75 % | 80 % |
| 38 | 30 % | 75 % | 100 % | 100 % |
| 39 | 50 % | 100 % | 100 % | 100 % |
| 40 | 75 % | 100 % | 100 % | 100 % |
| 41 | 100 % | 100 % | 100 % | 100 % |

Násobiče se násobí a výsledek se omezí na 0–100 %:

- super sezóna (průměrná známka ≥ 7,0 a ≥ 70 % odehraných minut): ×0,5,
- platná smlouva i na další sezónu: ×0,7 (fáze 6),
- hraje 3. ligu: ×0,6,
- vysoká profesionalita (návrh: skrytý atribut ≥ 75): ×0,8,
- málo minut (< 30 %): ×1,5,
- dlouhé zranění v sezóně (> 3 měsíce): ×1,5,
- volný hráč 32+ bez nabídky déle než 6 měsíců: konec kariéry jistě (fáze 6).

Doplňky:

- V zimě může hráč ohlásit, že je to jeho poslední sezóna: zpráva, rozloučení fanoušků, možnost ho přemluvit s malou šancí na úspěch (fáze 7, souvisí se vztahy a médii).
- Místo konce kariéry může zkušený hráč odejít dohrát do nižší soutěže (fáze 6, potřebuje přestupy a volné hráče).
- Po konci kariéry může klub dostat nabídku, že hráč zůstane jako trenér mládeže, skaut nebo asistent; jeho schopnosti se odvodí z hráčských atributů (fáze 6 spolu se skauty).

*Rozpor s dosavadním stavem:* kód z fáze 4 ukončuje kariéry podle věku bez ohledu na pozici už od 31 let (3 %) a slabší hráče dřív. Nová tabulka začíná později (33–37 let) a hráče 3. ligy naopak drží déle (×0,6). Kalibrace světa ve fázi 4 přitom ukázala, že při řídkých koncích kariér svět stárne. Ve fázi 4b se proto nová tabulka musí znovu ověřit přes `npm run calibrate:world` a vyvážit jinde, nejspíš tím, že AI uvolňuje staré a slabé hráče. Ti do fáze 6 ze hry zmizí, od fáze 6 se z nich stanou volní hráči a uplatní se pravidlo „32+ bez nabídky 6 měsíců“. Pravidlo „slabší končí dřív“ se ve fázi 4b zruší. **Stav po fázi 4b:** zavedeno; průměrný věk seniorů ve světě stoupl o ~1 rok (na ~26,4) a pak se ustálil, síla soutěží za 5 sezón zůstává v mezích (`npm run calibrate:world`).

*Mezera v designu:* chybí správa štábu (asistent, trenér mládeže). Kvalita asistenta je zmíněná v sekcích 3 a 12, ale najímání nikde, a nabídka „zůstat jako trenér nebo skaut“ ho potřebuje. Navrhuji štáb doplnit ve fázi 6 spolu se skauty.

## 6. Skauting a talenty

Skaut ukazuje CA a PA jako rozsah, který předpokládá průměrnou formu a průměrný vývoj. Skutečnost se liší podle formy, minut a náhody.

| Úroveň skauta | Přesnost | Příklad PA |
| --- | --- | --- |
| Začátečník | ±12 | 58–82 |
| Zkušený | ±6 | 66–78 |
| Elitní | ±2 | 71–75 |

Přesnost roste i s délkou sledování (jeden zápas vs. tři měsíce).

**Skautské tipy:** náhodné události typu „v Dolní Lhotě hraje třináctiletý kluk s mimořádným potenciálem“. Přivedení stojí peníze a přesvědčení rodičů. Četnost závisí na skautské síti v regionu.

**Vzácnost talentů v celé republice:**

- Generační talent (PA 85+, úroveň Yamal nebo Mbappé): zhruba jednou za 3 roky. Může hrát v základu už v prvním roce.
- Hvězdy (PA 78+): několik každou sezónu.

**Skautská síť: počet je důležitější než kvalita.** Talent nebo výhodnou koupi najdeš jen tam, kde máš skauta. Počet skautů určuje pokrytí, kvalita jen přesnost odhadu.

- Každý skaut pokrývá jednu oblast: kraj (mládež) nebo jednu soutěž či skupinu (dospělí hráči jiných týmů).
- Skautovi se zadává úkol: hledat talenty, hledat kaufy (levní nebo podceňovaní hráči, končící smlouvy), nebo sledovat konkrétního hráče.
- Když stejného hráče sleduje víc skautů, jejich odhady se spojí a rozsah se zúží (přibližně chyba / √n): dva slabí skauti ±8,5, čtyři slabí ±6.

**Překryv oblastí:** oblasti skautů se mohou částečně překrývat a do jedné oblasti jde poslat dva skauty. Každý skaut hledá svým „okem“, takže dva skauti v jedné oblasti mají větší šanci najít skrytý talent a jejich odhady se rovnou spojí.

| Varianta (stejný rozpočet) | Pokrytí | Přesnost | Výsledek |
| --- | --- | --- | --- |
| 5 slabých skautů (á 25 tis. Kč/měs.) | 5 oblastí | ±12, společně až ±5 | hodně tipů, hrubší odhady |
| 1 elitní skaut (125 tis. Kč/měs.) | 1 oblast | ±2 | přesné odhady, ale většina talentů ti unikne |

Platy skautů jsou herní návrh. Hra záměrně zvýhodňuje širší síť, elitní skaut dává smysl hlavně k ověření drahých přestupů.

**Doplněno ve fázi 6 (implementace, návrh):**

- Vlastní hráče zná klub přesně (CEL) a jejich POT odhaduje ±3. Hráče 1. ligy zná každý klub ±10, 2. ligy ±14 (televize, statistiky); hráče 3. ligy, akademií a volné hráče jen přes skauty. Atributy cizího hráče hra ukáže, až když je odhad aspoň tak přesný jako u hráčů 1. ligy.
- Odhad je rozsah, který vždy obsahuje skutečnou hodnotu (CEL ± polovina přesnosti, POT ± přesnost). Pozorování se skládají jako inverzní rozptyly: chyba = 1/√(Σ 1/přesnost²).
- Úkoly: kraj (mládež do 19 let a tipy), soutěž (talenty do 21 let, nebo „příležitosti“ = končící smlouvy a hráči na prodej), konkrétní hráč (4 pozorování měsíčně). Skaut za měsíc pozoruje 20 hráčů své oblasti.
- Tip: 6 % za měsíc a skauta v kraji; hráč 13–15 let s POT o 8–18 vyšším než běžný dorostenec, cena 100–400 tis. Kč, rodiče souhlasí v 60 % (peníze za jednání propadnou i při odmítnutí). Tip platí 3 měsíce.
- Kandidáti na skauty se obnovují každý červenec; po konci kariéry se hráč klubu může nabídnout jako skaut (úroveň podle „výběru místa“ a „vize a rozhodování“).

## 7. Reputace

Reputace hráče i klubu roste s výkony a ovlivňuje ceny, zájem ostatních klubů, sponzory a nábor.

**Hráč (0–100: lokální, ligová, národní, mezinárodní).** Roste s formou, góly, asistencemi, reprezentací a pozorností médií.

- Tržní cena roste s formou.
- Skauti jiných klubů ho začnou sledovat a přijdou nabídky.
- Hráč ve formě chce hrát. Na lavičce mu klesá morálka a časem se ozve.
- Hvězda zvyšuje návštěvnost a prodej dresů.

**Klub.** Skládá se z výsledků, počtu odchovanců v profesionálních ligách, kvality skautingu, finanční stability a evropských pohárů.

- Lepší dorostenci v náboru.
- Hráči snáz přijímají nabídky.
- Vyšší částky za prodané odchovance.
- Lepší sponzoři.

## 8. Přestupy a smlouvy

Malý klub získává kvalitu hlavně přes mladíky velkých klubů se smluvními klauzulemi. Smlouvy se řeší včas a hráč vždy ví, kolik by hráč chtěl.

| Klauzule | Význam | Příklad |
| --- | --- | --- |
| Zpětný odkup | prodávající může do X let koupit hráče zpět za pevnou cenu | prodej za 2 mil. Kč, do 3 let zpět za max. 20 mil. Kč |
| Právo dorovnat | o každé nabídce musí prodávající vědět a může ji dorovnat | Sparta dorovná nabídku Plzně |
| Podíl z dalšího prodeje | % z budoucího přestupu | 20 % |
| Hostování s opcí | po hostování lze hráče koupit za dohodnutou cenu | opce 3 mil. Kč |
| Hostování s povinným odkupem | po splnění podmínky je odkup povinný | po 20 zápasech |
| Bonusy | doplátky za góly, zápasy nebo postup | +500 tis. Kč při postupu |

**Smlouvy:** většina končí 30. 6. Dva roky před koncem (u smlouvy do 30. 6. 2030 od 1. 7. 2028) jde jednat o prodloužení a hráč ukazuje požadavky: plat, délku a ochotu prodloužit. Po konci letního okna v posledním roce smí jednat s jinými kluby.

| Zbývající smlouva | Násobič hodnoty |
| --- | --- |
| 3 roky a víc | 1,00 |
| 2 roky | 0,95 |
| poslední rok, léto | 0,80 |
| poslední rok, po konci letního okna | 0,50 |
| poslední rok, zimní okno | 0,35 |

**Tržní hodnota:**

```latex
\text{hodnota} = \text{základ (CA, věk)} \times \text{reputace} \times \text{smlouva} \times \text{forma} \times \text{soutěž (od fáze 6)}
```

**Finanční ředitel:** u každé nabídky porovná částku s tržní hodnotou, odhadne, kolik kupující maximálně zaplatí, a doporučí protinávrh včetně klauzulí. Přesnost jeho odhadu závisí na jeho kvalitě.

**Nabídky a agenti:** chodí přirozeně podle formy a reputace. Občas agent hráče potaji nabízí nebo hráč řekne, že chce odejít. Je to vzácné, žádné drama každý týden.

**Jednání celý rok, přestup v okně:** nabídky (přestup i hostování) mohou přijít kdykoli a hráč může kdykoli oslovit kohokoli. Mimo okno vznikne předběžná dohoda: hráč do otevření okna hraje za svůj klub, peníze a registrace proběhnou první den okna. Když se hráč mezitím vážně zraní, jde od dohody odstoupit. Herní okna: léto 1. 7. až začátek září, zima leden až polovina února (termíny ověříme podle FAČR).

**Nabídky na moje hráče:** přijít mohou kdykoli. Když klub chce hráče, kterého nechci pustit, musí přeplatit, typicky 110–150 % tržní hodnoty.

**Přestupní listina:** společný seznam hráčů na prodej nebo na hostování, kam dávám své hráče a AI kluby své. Hráč z listiny jde koupit levněji, zhruba za 85–95 % tržní hodnoty, protože se ho klub chce zbavit. Pro mé hráče na listině platí totéž.

**Volní hráči (bez smlouvy):** lze je podepsat okamžitě, kdykoli během roku, po dohodě na podmínkách. Patří sem hráči po konci smlouvy, propuštění hráči a starší hráči.

- Jsou vstřícnější: s každým měsícem bez klubu klesají jejich požadavky na plat (zhruba o 5–10 % měsíčně, nejníž na 60 %). Mohou ale chtít vyšší podpisový bonus, protože klub neplatí odstupné.
- Nehrají, takže nerostou a ztrácejí zápasovou kondici. Po podpisu potřebují 3–4 týdny, než jsou ve formě.
- Po 3 měsících bez klubu klesá FS zhruba o 1 bod měsíčně. Rok bez klubu je znát: CEL nižší o 3–6 bodů a mladíkům se zpomalí vývoj.

**Nákup:** poptávka nebo hledání, skautský report, nabídka klubu (částka, splátky, bonusy, klauzule), až 3 kola protinávrhů, pak osobní podmínky s hráčem (plat, podpisový bonus, délka, slibovaná role, případně výstupní klauzule), lekářská prohlídka a registrace.

**Poptávka:** zadáš „hledám útočníka do 23 let, max. 2 mil. Kč“ a agenti a kluby začnou nabízet hráče. AI kluby zveřejňují své poptávky a hráč může nabídnout své hráče.

**Prodej:** příchozí nabídky (přijmout, protinávrh, odmítnout), status „na prodej“ s cenou, aktivní nabídnutí hráče klubům, které na něj mají, hostování ven. Odmítnutí velké nabídky mírně sníží morálku hráče.

**Jak AI klub ocení hráče:** tržní hodnota × důležitost hráče pro klub × potřeba peněz × délka smlouvy × termín (konec okna zvyšuje tlak). Splátky bývají dražší než platba najednou.

**Živý trh:** AI kluby kupují, prodávají a hostují mezi sebou podle stejných pravidel. Velké kluby se budou zajímat i o tvoje talenty.

**Doplňky inspirované CSM (fáze 6):**

- AI kluby kupují hlavně na svou nejslabší pozici (podle síly nejlepší jedenáctky po pozicích, viz výběr sestavy z fáze 2).
- Tržní hodnota závisí i na úrovni soutěže: do vzorce výše přibude násobič soutěže. Po přestupu do vyšší soutěže roste postupně během sezóny (návrh: lineárně za 6 měsíců), aby nešlo koupit levně ve 3. lize a hned draze přeprodat.
- Hostování: součástí dohody je podíl platu, který platí každý z klubů (návrh: výchozí 50 : 50).

**Doplněno ve fázi 6 (implementace, návrh – čísla v `balance.json → transfers`):**

- Tržní hodnota = 8 mil. Kč × 1,13^(CEL − 64) × věk (17 let ×1,6 … 26 let ×1,0 … 35 let ×0,15) × potenciál (do 24 let +4 % za bod POT nad CEL) × forma (0,85–1,15) × smlouva (tabulka výše) × soutěž (1. liga 1,0, 2. liga 0,45, 3. liga 0,2). Reputace zatím chybí (fáze 7).
- Okna: léto 1. 7.–1. 9., zima 1. 1.–15. 2. AI trh běží první den okna a pak jednou týdně.
- Prodávající AI chce: hodnota × důležitost (základ ×1,35, rotace ×1,1, nadbytečný ×0,85) × (na listině 0,85–0,95, jinak 1,1–1,5) × (klub v mínusu ×0,9). Splátky (až 3 roční) počítá jako o 5 % za splátku méně, podíl z dalšího prodeje (max 30 %) jako bonus poloviny podílu. Nabídka pod 60 % požadavku je „nevážná“. Po 3 kolech klub jednání ukončí.
- Osobní podmínky: plat podle kvality a nového klubu, do nižší soutěže +40 %, do vyšší −10 %, nejméně současný plat; podpisový bonus 1–3 platy (volný hráč 3–6). Hráč přijme od 95 % požadavku.
- Prodloužení: plat podle kvality +10 %, při formě 7+ dalších +15 %, nespokojený s minutami (pod 30 %) +30 %; nejméně současný plat.
- Konec smlouvy 30. 6.: AI klub si nechá 16 nejcennějších hráčů (CEL, část potenciálu, věk) mladších 33 let, ostatní odcházejí jako volní hráči. Hráči manažera bez prodloužení odcházejí; jen když by kádr klesl pod minimum soutěže, asistent prodlouží nejlepším o rok (manažer je varován celou sezónu na Domů).
- AI kupuje jen pod svou cílovou silou (−1,5 bodu), na nejslabší místo v sestavě hráče aspoň o 3 body lepšího, do 35 % peněz a se zálohou 3 měsíčních platů, nejvýš 3 nákupy za okno. Neprodává, když by mu kádr klesl pod minimum. Hluboko pod cílem a bez dostupného hráče podepíše „volného hráče ze zahraničí“ (náhrada trhů mimo hru). Nabídky na hráče manažera: hráč na listině 25 % týdně, ostatní 2 % týdně; AI klub přeplatí nejvýš 105–130 % hodnoty.
- AI-AI hostování zatím není (mladé drží B-týmy); AI kluby dávají mladé na listinu k hostování, manažer si je může půjčit. Opce na hostování mladých = tržní hodnota.
- Volní hráči: skupina ~160 hráčů; když klesne pod 60 %, doplní se z nesimulovaných soutěží (síla průměr základní sestavy 2./3. ligy − 9). Po 18 měsících bez klubu, nebo od 32 let po 6 měsících, končí kariéru.
- Účetnictví (sekce 13): odstupné + provize agenta (5 %) + podpisový bonus se aktivují a odepisují rovnoměrně po dobu smlouvy; při prodeji se zbytek odepíše. Prodej je výnos hned, peníze chodí ve splátkách (pohledávka); nákup na splátky je závazek. Propuštění stojí 50 % zbývajících platů.
- Konec kariéry (fáze 4b) od fáze 6: platná smlouva i na příští sezónu ×0,7; místo konce kariéry jde 35 % hráčů s CEL aspoň o 3 nad průměrem 3. ligy „dohrát do nižší soutěže“ (volný hráč jen pro 3. ligu).
- Zatím není: zpětný odkup, právo dorovnat, povinný odkup, bonusy, poptávky, finanční ředitel, agenti nabízející hráče, morálka po odmítnutí nabídky (morálka přijde ve fázi 7).

## 9. Stadion a město

Stadion klub nezruinuje, ale dává jasný cíl: kdo chce do 1. ligy z okresního hřiště, potřebuje velkou investici, většinou s městem. Ceny jsou herní návrh, ne reálné náklady.

| Úroveň | Odpovídá | Kapacita | Vybavení | Investice na další úroveň |
| --- | --- | --- | --- | --- |
| 1 | okresní přebor | \~500 | lavičky, hrbolatý trávník | \~5 mil. Kč |
| 2 | ČFL/MSFL | \~1 500 | malá krytá tribuna | \~25 mil. Kč |
| 3 | 2. liga | \~3 000 | osvětlení, sedadla | \~150 mil. Kč |
| 4 | 1. liga | 5 000+ | vyhřívání trávníku, VIP, TV | \~400 mil. Kč a víc |
| 5 | evropské poháry | 10 000+ | skyboxy, moderní zázemí | pozdní hra |

**Výjimka:** po postupu bez potřebné úrovně jedna sezóna v pronajatém stadionu (nájem, nižší návštěva, naštvaní fanoušci). Pak musí být rozestavěno.

**Součásti:** kapacita a cena vstupenek určují příjem ze vstupného, kvalita trávníku ovlivňuje kombinační hru a zranění, VIP a skyboxy vydělávají nejvíc na diváka.

**Majitel:** město (vyjednává se rekonstrukce), místní podnikatel (část zaplatí, část chce po městě), bohatý majitel (zaplatí, ale chce rychlé výsledky).

**Dohoda s městem:** funguje jako mise s podmínkami, např. „rekonstrukce tribuny za 40 mil. Kč, pokud klub do dvou sezón vyhraje ČFL a akademie bude mít aspoň 60 dětí z města“. Ochota města závisí na vztahu, který roste s výsledky a prací s mládeží. Spory jsou extrémní výjimka.

**Doplněno ve fázi 7 (implementace, návrh – `balance.json → club`):**

- Úroveň stadionu klubu hráče se na začátku odvodí z kapacity (aspoň úroveň, kterou vyžaduje soutěž: 1. liga 4, 2. liga 3, 3. liga 2). Ceny podle tabulky; doba stavby 3 / 6 / 12 / 18 měsíců (návrh). Po dokončení má stadion aspoň kapacitu úrovně.
- Pronajatý stadion: nájem 2 % očekávaných příjmů měsíčně, návštěva ×0,75, fanoušci −5. Když na začátku další sezóny pořád chybí úroveň a stavba neběží, licence stojí 3 body.
- Dohoda s městem: podíl města = (vztah s městem − 30) × 1,2 %, nejvýš 60 %. Podmínka (náhodně jedna): skončit letos v horní polovině tabulky, letos postoupit, nebo mít v akademii aspoň 10 hráčů. Splněno: město +10. Nesplněno: město −25 a vrácení poloviny dosud zaplacené dotace.
- Investor: po postupu klubu, který je spolek. Vloží 80 % ročních očekávaných příjmů, klub se stane akciovou společností a investor 2 sezóny chce umístění o 1 místo lepší než cíl vedení.
- Majitele typu „město / podnikatel / bohatý majitel“ zatím hra nerozlišuje; AI kluby stadion nemodelují.

**Účetně:** stavba se aktivuje jako dlouhodobý hmotný majetek a odpisuje. Výsledovku zaří postupně, cash flow hned. Přesné zacházení podle českých předpisů a IFRS (včetně dotace od města) doplníme v části o ekonomice.

## 10. Herní režimy

Hlavní režim je kariéra od dna ve 3. lize. Volný výběr je doplňkový.

1. **Kariéra od dna (hlavní):** trenér s minulostí, třeba několik let u mládeže a trénování chlapů v divizi. Minulost určí startovní schopnosti. Přijdou 3–4 nabídky od klubů ze 3. ligy s různými profily (chudý klub se silnou akademií, ambiciózní majitel, klub s dobrým vztahem k městu).
2. **Volný výběr:** libovolný klub ze všech tří lig.

**Kariéra trenéra:** reputace trenéra roste s úspěchy. Nabídky od větších klubů chodí vzácně a jdou odmítnout. Při dlouhé krizi hrozí vyhazov.

**Hodnocení sezóny a vyhazov** (doplněk inspirovaný CSM; cíle vedení a jejich hodnocení ve **fázi 5** spolu s rozpočtem od vedení, vyhazov ve **fázi 8** s kariérou trenéra, průběžný ukazatel ve vztazích ve **fázi 7**):

- Každý cíl vedení (liga, pohár) se hodnotí 5 stupni: vynikající, úspěšná, přijatelná, neúspěšná, katastrofa. Návrh převodu: liga podle rozdílu skutečného a cílového umístění, pohár podle rozdílu dosaženého a cílového kola.
- Pohár je nesymetrický: úspěch hodně pomůže, neúspěch tolik neuškodí (váhy v `balance.json → board`).
- **Vyhazov:** při katastrofální sezóně, nebo po dvou neúspěšných sezónách za sebou.
- Ukazatel „Vedení“ ve vztazích (sekce 14) tohle hodnocení jen průběžně zobrazuje, sám o vyhazovu nerozhoduje.

**Doplněno ve fázi 8 (implementace, návrh – `balance.json → career`):**

- Kariéra od dna: pozadí trenéra „trenér mládeže“ (reputace 15, město +10), „bývalý hráč“ (20, kabina +10), „trenér divize“ (12, fanoušci +10); 4 nabídky ze 3. ligy s profily: chudý klub se silnou akademií (peníze ×0,6, dorostenci POT +6), ambiciózní majitel (peníze ×1,6, vedení −10), klub s dobrým vztahem k městu (město +20). Volný výběr: reputace podle soutěže (1. liga 60, 2. liga 40, 3. liga 20).
- Reputace 0–100 po sezóně: vynikající +12, úspěšná +7, přijatelná +2, neúspěšná −6, katastrofa −12; postup +8, sestup −6, titul +10, pohár +5.
- Nabídky větších klubů (vyšší soutěž nebo větší klub ve stejné) jen s dostatečnou reputací (např. 2. liga 30–45, 1. liga 50–85 podle velikosti); šance po vynikající sezóně 60 %, po úspěšné 30 %, po přijatelné 10 %; 1–2 nabídky, jdou odmítnout. Přestup trenéra proběhne hned na začátku sezóny.
- Vyhazov podle pravidla výše (katastrofa, nebo dvě neúspěšné za sebou): reputace −5 a 3 nabídky z klubů stejné nebo nižší úrovně (nouzově 3. liga). Dokud trenér nepřijme, sezóna nepokračuje. Konec kariéry (žádná nabídka) hra nezná.

*Otevřená otázka:* sekce 13 a 14 říkají, že vedení hodnotí i finance (účetní výsledek, „zdravé finance“), ale doplněk zná jen cíle liga a pohár. Navrhuji jako třetí cíl přidat finance (hodnocené stejnou stupnicí). Rozhodnutí je na tobě.

## 11. Hráči a atributy

Hodnocení hráče stojí na dvou číslech: technické schopnosti (TS) a fyzické schopnosti (FS). Z nich vzniká celkové hodnocení (CEL). CEL odpovídá aktuální schopnosti (CA) a POT potenciálu (PA) ze sekce 5. Na první pohled je vidět, jaký typ hráče to je.

**Zobrazení v soupisce:** CEL 70 · POT 80 · TS 75 · FS 65 · forma · kondice. Takový hráč je technicky vybavený, ale fyzicky ještě nevyzrálý (typický mladík z juniorky). Podrobné atributy jsou až v profilu hráče po rozkliknutí.

```latex
\text{CEL} = 0{,}5 \times \text{TS} + 0{,}5 \times \text{FS}
```

Poměr 50/50 je výchozí a je uložený v datech, aby se dal ladit podle pozice.

| Skupina | Atributy (1–100) |
| --- | --- |
| TS – technické schopnosti | zakončení, přihrávka, technika, centry, hlavičky, obranné zákroky, standardky, výběr místa, vize a rozhodování |
| FS – fyzické schopnosti | rychlost, akcelerace (sprint), výdrž, síla, obratnost, výskok |
| TS brankáře | reflexy, chytání, výběhy a 1 na 1, umístění, rozehrávka |

Uvnitř TS a FS mají atributy váhy podle pozice (uložené v datech). Příklad pro útočníka: TS = zakončení 35 %, výběr místa 25 %, technika 20 %, hlavičky 10 %, přihrávka 10 %; FS = rychlost 30 %, akcelerace 25 %, síla 25 %, výskok 10 %, výdrž 10 %.

**Mentalita:** žádná samostatná skupina. Výběr místa a rozhodování patří do TS. V profilu zůstává vůdcovství pro volbu kapitána.

**Kapitán** (doplněk inspirovaný CSM, **fáze 7** spolu s morálkou a náladou kabiny): kapitán s vysokým vůdcovstvím mírně tlumí propady formy a nálady týmu (návrh: od vůdcovství 70, tlumení 25 %). Tím se mění dřívější formulace „vůdcovství je jen drobnost“. Kód už kapitána vybírá a vůdcovství s věkem roste (fáze 2 a 4), účinek zatím nemá.

**Skryté atributy:** potenciál, adaptace, profesionalita, konzistence, náchylnost ke zraněním. Bez „velkých zápasů“ a ambicí. Touhu hrát řídí forma a morálka.

**Stavové hodnoty:** forma, kondice (%), morálka, sebevědomí.

**Vývoj:** FS roste hlavně mezi 17 a 23 lety (dozrání, posilování) a klesá od zhruba 32 let. TS může růst dél. Růst jde hlavně do atributů, které hráč na své pozici používá.

| Pozice hráče | Výkon |
| --- | --- |
| přirozené pozice (1–3, např. hrot i podhrot, křídlo i kraj zálohy) | 100 % |
| příbuzná pozice | 90 % |
| cizí pozice | 70 % |

**Vlastnosti (0–2 na hráče):** jen lehká výhoda, zhruba +3 až 5 % v jedné věci. Příklady: kabinový bavič (mírně lepší nálada týmu), silný ve vzduchu (víc gólů hlavou), specialista na standardky, skleněný kotník (častější zranění).

## 12. Simulace zápasu a taktika

Simulují se šance, ne fyzika hřiště. Celé kolo všech lig se spočítá okamžitě a výsledky se ladí podle reálných statistik.

| Nastavení | Volby | Kompromis |
| --- | --- | --- |
| Rozestavení | 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2, 4-1-4-1 | víc hráčů vepředu = méně vzadu |
| Styl | kombinační / přímočarý / protiútoky | kombinační chce vysoké TS, přímočarý těží z FS, protiútoky chtějí rychlé hráče |
| Nastavení týmu | defenzivní / vyvážené / útočné | víc šancí pro oba týmy |
| Presink | nízký / střední / vysoký | vysoký bere míče, ale rychleji vyčerpá kondici a přidá fauly |

Navíc exekutor standardek a kapitán. **Každé nastavení má ve hře nápovědu:** krátký popis, co způsobí, pro jaké hráče se hodí a na co si dát pozor (např. „Vysoký presink: víc zisků míče u soupeřovy brány, ale tým se po hodině unaí. Hodí se pro tým s vysokou výdrží.“).

**Výpočet:**

1. Síla týmu v pásmech útok, záloha, obrana z TS a FS sestavy, upravená formou, kondicí a pozicí (100/90/70 %).
2. Každou minutu: držení míče (zálohy a styl), šance (útok vs. obrana), xG šance 0,02–0,8, gól s pravděpodobností xG upravenou zakončením vs. brankářem.
3. Kondice během zápasu klesá (rychleji při vysokém presinku a slabé výdrži), střídání osvěží.
4. Mírný domácí bonus, větší s plným stadionem.
5. Události: fauly, karty, penalty, zranění.

**Trávník:** jen malý vliv, aby nekazil hru. Nejhorší trávník sníží účinnost kombinační hry nejvýš o 3 % a riziko zranění zvýší zhruba o desetinu.

**Kalibrace:** průměr gólů v 1. lize kolem 2,5 na zápas ([2025/26](https://football.fandom.com/wiki/2025%E2%80%9326_Czech_First_League)), v nižších soutěžích víc (MSFL kolem 3,2 gólu, 45 % domácích výher, 25 % remíz podle [SofaScore](https://www.sofascore.com/hu/bajnoksag/foci/czech-republic/msfl/9386)). Tým 3. ligy má proti špičce 1. ligy v poháru šanci zhruba 5–10 %. **Proměňování penalt ~77 %** (doplněk; cíl měl být v kalibraci už ve fázi 2, test přibude ve **fázi 4b**). Změřeno na současném enginu: 78,2 % z 2 740 penalt v 6 sezónách, takže cíl sedí a jde jen o přidání kontroly.

**Známky (1–10):** základ 6,0; gól +1,0; asistence +0,6; klíčová přihrávka +0,2; chyba ke gólu −0,8; vyloučení −1,5; zákrok brankáře +0,15; inkasovaný gól brankáře −0,3; výsledek týmu ±0,3.

**Po zápase:** 2–3 věty asistenta, proč to tak dopadlo (držení míče, kondice, xG).

**Rychlý režim:** asistent střídá unavené hráče, při prohrávání jde do útoku, při vedení v závěru zatáhne. Kvalita rozhodnutí závisí na jeho schopnostech.

**Pro vývoj:** simulace má pevné semínko náhody (seed), aby se dala automaticky testovat (např. 10 000 sezón a kontrola průměru gólů).

**Doplněno ve fázi 2 (implementace):**

- **Střídání:** nejvýš 5 hráčů ve 3 oknech (bez okna v nastaveném čase), lavička 9 hráčů. Asistent střídá unavené hráče v 60., 70. a 80. minutě a zraněné hned.
- **Tresty v lize:** stopka na 1 zápas za každou 4. žlutou kartu. Druhá žlutá v zápase = stopka na 1 zápas a tyto žluté se do kumulace nepočítají. Přímá červená = stopka 1–3 zápasy (délka je odhad, neověřeno proti disciplinárnímu řádu FAČR).
- **Zranění:** riziko roste s náchylností ke zraněním a únavou. Délka 3 dny až 8 měsíců. Zraněný hráč nenastoupí, dokud se nevyléčí.
- **Forma:** průměr posledních 5 známek, vliv na výkon nejvýš ±3 %, aby nevznikla smyčka „bohatí bohatnou“.
- **Známky:** ke vzorci výše přibyla malá výkonová složka (lepší hráč na svém místě o něco výš, šum podle konzistence). Průměr je zhruba 6,4–6,5, což odpovídá pásmu „průměr“ v tabulce růstu (sekce 5).
- **Engine je krokovač** (minuta po minutě), takže živý režim (sekce 4) ho použije beze změn.
- **Mezi koly** zatím počítáme 7 dní (kondice se obnoví, zranění se hojí), dokud nebude kalendář.

**Karty a tresty** (doplněk; pravidlo platí už od fáze 2, upozornění přibude ve **fázi 4b**): každé 4 žluté = stopka na 1 zápas, červená = 1–3 zápasy. Asistent předem upozorní na hráče se 3 žlutými (obecně „jedna žlutá do stopky“).

*Ověření pravidla FAČR:* oficiální disciplinární ani soutěžní řád se z vývojového prostředí ověřit nepodařilo, weby FAČR, LFA i zpravodajské weby jsou blokované. Vyhledávač vrátil jen sekundární zdroje (zpravodajství), takže následující body jsou **neověřené** a slouží jako podklad pro tvé ověření:

- 4. žlutá v sezóně = stop na 1 zápas: zpravodajství to uvádí shodně se hrou.
- Nadstavba má podle zprávy TN.cz vlastní počítání: žluté ze základní části se nepřenáší, 2. žlutá = 1 zápas, 4. žlutá = 2 zápasy. Hra teď počítá žluté přes celou sezónu včetně nadstavby.
- Délku trestu za červenou kartu určuje disciplinární komise. Ve zprávách se objevují tresty na 1 i 3 zápasy, což sedí s rozsahem 1–3.
- Jak se počítají žluté v MOL Cupu, ze zdrojů nevyplynulo. Hra je teď sčítá s ligou, ve skutečnosti se pravděpodobně počítají zvlášť.

*Návrh úprav po ověření:* oddělit počítání karet pro pohár a pro nadstavbu (příprava v `balance.json → discipline.postseason`, zatím vypnuto).

**Zranění** (doplněk, **fáze 4b**): čtyři typy podle délky:

| Typ | Délka |
| --- | --- |
| lehké | 1–2 týdny |
| střední | 3–6 týdnů |
| těžké | 2–6 měsíců |
| velmi těžké | 6–9 měsíců |

Po návratu má hráč nižší kondici a formu a několik týdnů vyšší riziko, že se zraní znovu. Starší hráči se v zápase unaví rychleji (koeficient podle věku v `balance.json → condition.ageFatigue`).

*Rozpor s kódem:* fáze 2 má nejkratší zranění 3 dny a nejdelší 8 měsíců (4 skupiny s jinými hranicemi) a zranění z tréninku 3–21 dní. Obojí se ve fázi 4b převede na nové typy. Únava podle věku se počítá navíc k výdrži, která se od 32 let snižuje vývojem. Koeficient proto musí být mírný, jinak se pokles započítá dvakrát. Po zavedení je nutná kalibrace (`npm run calibrate`, počet zranění na zápas).

## 13. Ekonomika a účetnictví

Hra vždy ukazuje dvě čísla: peníze na účtu (z nich se platí výplaty) a účetní výsledek (podle něj hodnotí majitel a média). Účetní rok je 1. 7. – 30. 6. jako sezóna. Bez daní, bez přepínače ČÚS/IFRS, výkazy hodně zjednodušené.

**Rozpočet od vedení (1. 7.):** platový strop, přestupní rozpočet, investiční rozpočet. Přesun mezi nimi nejvýš 20 %.

**Inspirace z reálného klubu:** struktura tržeb Slavie za 18 měsíců do 30. 6. 2025 (v mil. Kč). Velké kluby žijí z prodeje hráčů a evropských pohárů, vstupné a reklama jsou stabilní základ.

| Položka | Slavia, 1/2024–6/2025 |
| --- | --- |
| Prodej a hostování hráčů | 1 043 |
| Příspěvky UEFA | 458 |
| Vstupenky | 358 |
| Reklama | 258 |
| Ostatní služby | 128 |
| Televizní práva | 81 |
| Zboží (fanshop) | 41 |

**Příjmy ve hře:** vstupné a permanentky, sponzoři (hlavní, dresový, město), centrální příjmy ligy, odměny za umístění a poháry, prodej a hostování hráčů, fanshop a VIP.

**Náklady ve hře:** platy a prémie hráčů a týmu (největší položka), náklady na hráčské smlouvy (rozpouštění nákupů), provoz stadionu, akademie a B-tým, skauti, agenti, úroky, odpisy stadionu.

**Hráči v účetnictví (podle praxe Slavie):** nákup hráče (přestupní částka, agent, podpisový bonus) se rozloží do nákladů rovnoměrně po dobu smlouvy. Při prodeji je celá částka tržba a nerozpuštěný zbytek jde do nákladů. Odchovanec nemá žádný zbytek, takže jeho prodej je celý zisk. Dlouhé zranění sníží hodnotu opravnou položkou.

|  | Koupený hráč | Odchovanec |
| --- | --- | --- |
| Nákup (částka + agent) | 4,4 mil. Kč, smlouva 4 roky | 0 |
| Roční náklad | 1,1 mil. Kč | 0 |
| Zbytek po 2 letech | 2,2 mil. Kč | 0 |
| Prodej za 7 mil. Kč: výsledek | +4,8 mil. Kč | +7 mil. Kč |
| Peníze na účet | 7 mil. Kč | 7 mil. Kč |

**Splátky přestupů a postoupení pohledávek:** přestupy se platí ve splátkách (1–3 roky). Pohledávku z prodeje jde postoupit a mít peníze hned, se srážkou zhruba 5–12 % (herní hodnota). Inspirace: Slavia vykazuje dlouhodobé pohledávky z přestupů i výnosy a náklady z postoupení pohledávek.

**Podmíněné platby** (bonusy, podíly z dalšího prodeje): účtují se, až když podmínka nastane.

**Dotace od města:** zaplatí část stavby, odepisuje se jen zbytek.

**Když docházejí peníze:** finanční ředitel hlídá, na kolik měsíců peníze vystačí. Řešení: úvěr, záloha od sponzora, postoupení pohledávky, prodej hráče v nouzi (levněji), půjčka nebo vklad majitele. Závazky po splatnosti k termínu licence znamenají odpočet bodů nebo problém s licencí.

**Právní forma a investor (zjednodušeně):** menší kluby začínají jako spolek. Když klub roste (např. postup do 2. ligy nebo vyšší reputace), přijde událost „Investor má zájem“. Klub se změní na akciovku a přitečou peníze, ale nový majitel má očekávání.

| Nabídka (příklad) | Peníze | Podmínka |
| --- | --- | --- |
| Místní stavební firma | 30 mil. Kč | postup do 2 let |
| Zahraniční fond | 120 mil. Kč | prodej hráčů se ziskem, tlak na trenéra |
| Bohatý fanoušek | 15 mil. Kč | žádná |

Nabídku jde odmítnout a počkat na lepší.

**Doplněno ve fázi 5 (implementace):**

- Finance mají všechny kluby (AI je potřebuje ve fázi 6 k přestupům); jednotlivé transakce se ukládají jen pro klub hráče, AI kluby mají součty po kategoriích. B-tým a akademii platí A-tým.
- **Příjmy:** vstupné (návštěva podle velikosti klubu, umístění, ceny a kapacity stadionu; 35 % permanentky se slevou 30 %), fanshop a občerstvení, VIP, sponzoři a centrální příjmy (měsíčně), odměny za konečné umístění a za kola MOL Cupu. **Náklady:** platy (podle CEL nad průměrem soutěže a velikosti klubu), prémie za výhru a remízu, štáb, provoz stadionu, akademie a B-tým, pořadatelství, odpisy stadionu, úroky.
- Všechna měřítka jsou herní odhad laděný tak, aby typický klub hospodařil zhruba vyrovnaně a platy dělaly ~55 % příjmů (`npm run calibrate:world` hlídá hospodaření po úrovních). Sestupová klauzule: po sestupu plat −30 %.
- **Smlouvy** dostali všichni hráči na začátku hry (1–4 roky, plat podle kvality); do fáze 6 se končící smlouvy automaticky prodlužují.
- **Vstupné** se nastavuje jednou za sezónu, před prvním domácím zápasem. **Úvěr** do 30 % očekávaných ročních příjmů, 7 % ročně. AI klubům chybějící peníze doplní majitel; klubu hráče hrozí při záporném stavu k 31. 5. odpočet 3 bodů v příští sezóně (licence).
- **Cíle vedení** (1. 7.): liga podle pořadí síly kádru v soutěži (favorit do 2.–3. místa, ostatní o 2 místa hůř), pohár podle úrovně a velikosti. Hodnocení na konci sezóny 5 stupni, pohár nesymetricky; pravidlo vyhazovu se zatím jen zobrazuje (vyhazov ve fázi 8).

**Výkazy v sezónním reportu (mega zjednodušené):**

- Výsledovka: tržby (vstupné, sponzoři, liga a poháry, prodej hráčů), náklady (platy, hráčské smlouvy, provoz, akademie, ostatní), výsledek.
- Rozvaha: stadion, hodnota hráčských smluv, pohledávky, peníze; vlastní kapitál, úvěry a závazky.
- Cash flow: graf stavu peněz po měsících.

## 14. Vztahy, média, fanoušci a humor

Tahle vrstva dává hře atmosféru a zpětnou vazbu, ale čísla mění jen málo a nesmí otravovat.

| Ukazatel | Zvedají ho | Srážejí ho | Vliv na |
| --- | --- | --- | --- |
| Fanoušci | výhry, derby, odchovanci v sestavě, góly, hvězdy | prohry, drahé vstupenky, prodej oblíbence | návštěvnost, permanentky, fanshop |
| Vedení | plnění cílů, zdravé finance | ztráty, nesplněný cíl | rozpočet; průběžně zobrazuje hodnocení sezóny (sekce 10), o vyhazovu rozhoduje to hodnocení |
| Město | výsledky, mládež, akce pro komunitu | skandály | dotace a stadion |
| Kabina | výhry, minuty, férové smlouvy, bavič | lavička pro hráče ve formě, nevyplacené prémie | morálka a výkon |

**Fanoušci:** základna roste pomalu s úspěchy a reputací. Ceny vstupenek se nastavují jednou za sezónu (permanentka, běžný zápas, příplatek na derby a pohár). Kotel občas přinese pyrotechniku a pokutu, ale také lepší atmosféru a domácí bonus.

**Média:** titulky po zápasech ze šablon podle úrovně soutěže (okresní deník až celostátní sport). Tiskovky jen při důležitých událostech, 2–3 odpovědi s tónem klidný, sebevědomý nebo útočný a malým dopadem.

**Sociální sítě:** vtipný feed příspěvků fanoušků, který ukazuje náladu. Bez dopadu na čísla.

**Náhodné události:** nejvýš 1–2 měsíčně, častější v nižších soutěžích, malý dopad. Příklady: reklama pro místní uzenářství, rvačka maskotů, starosta v přípravném zápase, zapadlá rolba. Frekvence jde nastavit (vypnuto, občas, často). Sponzoři v nižších soutěžích jsou lokální (pneuservis, hospoda, stavebniny).

**Doplněno ve fázi 7 (implementace, návrh – `balance.json → club`, texty `data/flavor.json`):**

- Vztahy 0–100 (výchozí fanoušci 50, vedení 60, město 50, kabina 55), mimo vedení se každý měsíc vracejí o 5 % k výchozí hodnotě. Výhra fanoušci +1,5 a kabina +2, prohra opačně, derby (stejné město) u fanoušků dvojnásob. Vstupné nad 130 % referenční ceny fanoušci −1 měsíčně, pod 80 % +1. Akademie s aspoň 10 hráči: město +1 měsíčně. Hráč ve formě (7+) s méně než 30 % minut: kabina −2 a zpráva. Prodej oblíbence (3 nejvíc nasazení): fanoušci −3.
- Vedení ukazuje průběžné hodnocení sezóny (po 3 zápasech): 55 + 15 × skóre stupně, −15 při záporném účtu.
- Vliv: fanoušci návštěva ±10 %, kabina síla týmu ±3 % (jen tým hráče), město podíl na stavbě. Kapitán s vůdcovstvím 70+ tlumí propady nálady kabiny o 25 %; tlumení propadů formy zatím není (forma je průměr známek).
- Média: po každém zápase hráče titulek podle úrovně soutěže (celostátní / krajská / místní). Tiskovky po 3 porážkách nebo 4 výhrách v řadě, po postupu a sestupu: 3 tóny s malým dopadem (útočný tón může stát pokutu).
- Sociální sítě: 2 příspěvky fanoušků po zápase, bez dopadu.
- Náhodné události: nastavení vypnuto / občas (40 % za měsíc) / často (85 %), ve 3. lize ×1,3; některé s volbou. Peníze událostí jsou pro 2. ligu, 1. liga ×2,5, 3. liga ×0,4.
- Ohlášení poslední sezóny: v lednu hráč, jehož šance na konec kariéry je aspoň 50 %; přemluvit jde s šancí 15 % (zůstane ještě sezónu), jinak po sezóně jistě končí.

**Ceny sezóny:** gól sezóny, objev sezóny, nejlepší a nejhorší přestup, nejzbytečnější žlutá karta, hláška sezóny.

**Doplněno ve fázi 8 (implementace):** gól sezóny = gól s nejnižším xG v zápasech mého týmu; objev = hráč do 21 let s nejlepší průměrnou známkou v mé soutěži (aspoň 8 zápasů); nejlepší a nejhorší přestup ze všech placených přestupů sezóny (aspoň 5 zápasů; nejhorší = vysoká cena × slabá známka); nejzbytečnější žlutá = nejpozdější žlutá v zápase s největším rozdílem skóre (moje zápasy); hláška = šablona z `flavor.json` s hráčem mého týmu. Ceny se ukazují na konci sezóny a ukládají do historie.

## 15. Uživatelské rozhraní

Hra je pro PC v prohlížeči, česky, s moderním čistým vzhledem a akcentovou barvou podle klubu. Hlavní obrazovka vždy říká, co dělat dál: další zápas, čekající rozhodnutí a tlačítko Pokračovat (i mezerník). Nahoře je vždy stav peněz a na kolik měsíců vydrží. Ke každé hlavní věci se hráč dostane nejvýš na dvě kliknutí.

| Obrazovka | Obsah |
| --- | --- |
| Domů | další zápas, rozhodnutí, vztahy, cíl vedení, forma, zranění |
| Pošta | tři úrovně priority, týdenní souhrn |
| Soupiska | pozice, jméno, věk, CEL, POT, TS, FS, forma, kondice, smlouva do, hodnota; filtry A-tým, B-tým, mládež, hostování |
| Profil hráče | karta, detailní atributy, graf vývoje CEL, statistiky, smlouva a požadavky, historie |
| Taktika | hřiště s přetahováním hráčů, 4 nastavení s nápovědou, doporučení asistenta |
| Zápas | živý režim a výsledková obrazovka ve stylu CSM |
| Přestupy | hledání, poptávky, nabídky, vyjednávání s klauzulemi, rada finančního ředitele |
| Skauting | mapa ČR po krajích s pokrytím skautů, skauti a jejich úkoly |
| Soutěže | tabulky, rozpis, střelci, pavouk MOL Cupu |
| Finance | peníze na účtu, graf cash flow, zjednodušené výkazy, rozpočet |
| Klub | stadion, akademie, dohoda s městem, vztahy, investor |
| Sezónní report | souhrn sezóny, výkazy, vývoj hráčů, ceny sezóny |

## 16. Technický plán pro Claude Code

Hra se staví po fázích a každá končí něčím, co jde spustit a vyzkoušet. Herní logika je oddělená od obrazovek, aby se dala testovat a ladit simulací tisíců sezón.

**Technologie:** TypeScript, React a Vite (hra v prohlížeči na PC), Zustand na stav hry, Vitest na testy, Recharts na grafy. Ukládání do prohlížeče (IndexedDB) a export a import uložené hry jako JSON soubor. Bez serveru.

**Struktura projektu:**

```
fotbalovy-manazer/
  CLAUDE.md            kontext projektu pro Claude Code
  docs/design.md       tento designový dokument
  data/                ligy, kluby, jména, balance.json (všechny laditelné konstanty)
  src/engine/          herní logika bez UI: zápas, vývoj, finance, přestupy, AI klubů, kalendář
  src/state/           stav hry, ukládání
  src/ui/              obrazovky a komponenty
  tests/               testy a kalibrační simulace
```

**Datový model:** klub, hráč, smlouva, soutěž, zápas, skaut, transakce. Každý pohyb peněz je transakce s typem a obdobím. Výkazy se z transakcí jen agregují a nákup hráče má vlastní rozvrh rozpouštění do nákladů.

| Fáze | Obsah | Hotovo, když |
| --- | --- | --- |
| 0 | projekt, CLAUDE.md, design do docs/, git | `npm run dev` ukáže prázdnou stránku |
| 1 | 82 klubů v JSON, generátor fiktivních hráčů, rozpis zápasů, tabulky | příkaz odsimuluje celou sezónu s náhodnými výsledky |
| 2 | model hráče (CEL, TS, FS, forma, kondice), simulace zápasu, známky, kalibrace | 1 000 sezón dá průměr gólů a domácích výher v cílovém rozsahu |
| 3 | základní UI: Domů, Soupiska, Profil, Taktika, rychlý zápas, Soutěže, Pokračovat, ukládání | **MVP: odehraju celou sezónu** (hotovo) |
| 4 | vývoj hráčů, stárnutí, mládež, B-týmy, přechod sezóny, postupy, nadstavba, baráže, MOL Cup | odehraju 5 sezón za sebou (hotovo) |
| 4b | doplňky inspirované CSM k hotovým částem: konce kariér podle pozic, zranění podle typů a návrat po zranění, únava podle věku, upozornění na 3 žluté, kalibrace penalt | `calibrate` a `calibrate:world` projdou (hotovo) |
| 5 | ekonomika: rozpočet, platy, vstupné, transakce, výkazy, cash flow; cíle vedení a jejich hodnocení | sezónní report s výkazy a hodnocením sezóny (hotovo) |
| 6 | přestupy, smlouvy, přestupní listina, volní hráči, skauting, živý trh AI | koupím, prodám a najdu talent |
| 7 | stadion, město, investor, vztahy, média, humor | vytáhnu klub o ligu výš |
| 8 | živý režim zápasu, kariéra trenéra, ceny sezóny, ladění | kompletní hra |

**Pravidla práce s Claude Code:**

- Jedna fáze (nebo její část) na jedno zadání. Nejdřív si nechat navrhnout plán, pak teprve programovat.
- Po každé fázi spustit hru a testy a uložit stav do gitu (commit).
- Všechna čísla pro vyvažování (růst, ceny, šance) patří do `data/balance.json`, ne do kódu.
- Simulace používá semínko náhody, aby šla opakovat a testovat.
- Když se něco změní v designu, upravit i `docs/design.md`.

## 17. Stav návrhu

Sekce 1–15 jsou odsouhlasené, sekce 16 je návrh technického plánu. Zbývá:

- [ ] Hráči a atributy (hotovo, sekce 11)
- [ ] Simulace zápasu (hotovo, sekce 12)
- [ ] Ekonomika a účetnictví klubu (hotovo, sekce 13)
- [ ] Média, fanoušci, humor (hotovo, sekce 14)
- [ ] Uživatelské rozhraní (hotovo, sekce 15)
- [ ] Technická architektura a plán MVP pro Claude Code (návrh, sekce 16)
- [ ] Ověřit seznamy 2. a 3. ligy proti FAČR
- [ ] Ověřit disciplinární pravidla FAČR (žluté v nadstavbě a v poháru, tresty za červené), viz sekce 12
- [x] Doplňky inspirované Czech Soccer Managerem zapsané (sekce 5, 8, 10, 11, 12, 14); implementace podle fází v sekci 16

**Možná později** (vědomě vynecháno): trénování reprezentace, herní scénáře (výzvy), editor dat ve hře.

## Zdroje

- [Dresy týmů Chance Ligy 2026/27 (CC.cz)](https://cc.cz/vyhraje-styl-z-liberce-nebo-odvaha-z-prahy-hlasujte-ktere-fotbalove-dresy-ceskych-klubu-jsou-nejhezci/)
- [Vše o Chance Lize: termíny a nadstavba (Flashscore)](https://www.flashscore.pl/wiadomosci/fotbal-chance-liga-vse-podstatne-o-chance-lize-terminy-system-nadstavby-i-prestupova-obdobi/0pK6EL4F/)
- [Chance Národní Liga 2026/27 (4score)](https://4score.ru/leagues/265/)
- [ČFL A 2026/27 (futbol24)](https://www.futbol24.com/national/Czech-Rep/CFL/2026-2027/Group-A)
- [ČFL B 2026/27 (futbol24)](https://www.futbol24.com/national/Czech-Rep/CFL/2026-2027/Group-B)
- [MSFL 2026/27 (BetExplorer)](https://www.betexplorer.com/football/czech-republic/3-msfl/)
- [MOL Cup, osmifinále a finále (České noviny)](https://www.ceskenoviny.cz/zpravy/2893359)

- Inspirace pro doplňky v sekcích 5, 8, 10, 11 a 12: wiki Czech Soccer Manageru (csmweb.net, stránky skills, zapas, kariera, obchod). CSM není vzor, jen inspirace. Stránky nebyly z vývojového prostředí načtené, doplňky vycházejí ze zadání.

* Výroční zpráva SK Slavia Praha – fotbal a.s. k 30. 6. 2025 (nahraná uživatelem): účetní postupy k hráčům, struktura výnosů a nákladů
