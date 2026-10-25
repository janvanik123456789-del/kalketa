# Referenční výpočty

Každý referenční výpočet (R1–R18, viz docs/01-filozofie.md, kap. 10) má vlastní složku
s listem a nezávisle ověřenými očekávanými výsledky (s tolerancí a zdrojem ověření).
Program je nabízí jako vzorové příklady (Soubor → Vzorové příklady), tříděné podle oboru.

## Třídění podle oboru (2026-10-14)

Složka výpočtu leží ve složce oboru: `reference/<obor>/<výpočet>/`, např.
`03_Strojirenstvi_a_mechanika/R9-klikovy-mechanismus/`. Číslo na začátku složky oboru
určuje pořadí a název v menu (katalog `samples.field.03`, česky i anglicky); menu ukazuje
jen obory, které už nějaký výpočet mají. Nový obor = nová složka s číslem ze seznamu:

`00_Uvod_a_pruvodce`, `01_Matematika_a_numericke_metody`, `02_Fyzika`,
`03_Strojirenstvi_a_mechanika`, `04_Stavebnictvi_a_pozemni_stavby`,
`05_Elektrotechnika_a_elektronika`, `06_Energetika_a_termodynamika`,
`07_Chemie_a_procesni_inzenyrstvi`, `08_Materialove_inzenyrstvi`,
`09_Automatizace_a_rizeni`, `10_Technologie_a_vyroba`, `11_Technicka_zarizeni_budov`,
`12_Doprava_a_dopravni_inzenyrstvi`, `13_Geodezie_a_geoinformatika`,
`14_Environment_a_hydrologie`, `15_Biomedicina_a_bioinzenyrstvi`,
`16_Finance_a_statistika`, `17_Obecne_inzenyrske_vypocty`, `99_Pokrocile_a_specialni_metody`.

Obor jde rozdělit na podobory: `reference/<obor>/<podobor>/<výpočet>/`, např.
`03_Strojirenstvi_a_mechanika/01_Kinematika_a_dynamika/R9-klikovy-mechanismus/`. Složka podoboru
nese své jméno v souboru `nazev.json` (`{"cs": "Kinematika a dynamika", "en": "Kinematics and dynamics"}`),
program ho ukáže jako další podmenu oboru (jen když má výpočty). Výpočet může ležet i přímo v oboru.
Strojírenství má podobory `01_Kinematika_a_dynamika`, `02_Pevnost_a_pruznost`, `03_Vibrace_a_kmitani`,
`04_Technicke_tekutiny`, `05_Tepelne_vypocty`, `06_Strojni_prvky`.

Příklady ze zdrojů (články, učebnice) se převádějí do jednotek SI; obrázky jsou vlastní.

Teorie k výpočtu patří do souboru `podklady.md` vedle listu: program ho otevře jako vrstvu Podklady (Markdown poznámek, vzorce v blocích ```` ```kalk ````). Referenční test ověří, že každý vzorec v podkladech platí.

Jádro je hotové, až projdou všechny bez kódu specifického pro jeden obor.

| Složka | Obor | Co ověřuje |
|---|---|---|
| 00_Uvod_a_pruvodce/R24-pruvodce-police | průvodce | **úvodní list pro nového uživatele**: police na knihy (únosnost a průhyb prkna) a u každého oddílu tip, co Kalketa ukazuje: čísla s jednotkami a komentáři, posuvník rozpětí, dřevo z tabulky (`pick`), vzorce s dosazením, posudky se zdrojem, graf průhybu, řešič pro nejtenčí prkno, Podklady s ověřenými odvozeními a Pythonem; obrázek nakreslil pomocník na modelu Haiku |
| 04_…/R1-nosnik | stavař | výběr profilu z tabulky, posudky, nejlehčí vyhovující profil |
| 04_…/R20-deska-ohyb | stavař | reálný příklad (skripta ČVUT FSv, Příklady navrhování betonových konstrukcí podle EC2, př. 3): ohybová výztuž stropní desky třemi způsoby (odhad ramene, součinitele z tabulky P04 interpolací, přímý vzorec), posouzení únosnosti, výztuž za mezí kluzu, minimální výztuž, rozteče, rozdělovací výztuž; tabulky betonů (P03) a součinitelů (P04) ve vrstvě Data, **číslované oddíly jako ve skriptech** (`layout.json` vedle listu: `"headings": "numbered"`); teorie v Podkladech |
| 03_…/05_Tepelne_vypocty/R2-vymenik-hridel | strojař | °C a rozdíly teplot, logaritmický teplotní spád, vlastní funkce, řešič pro nejmenší průměr, materiál z tabulky |
| 07_…/R3-roztok | chemik | tabulka látek (molární hmotnost), ředění, disociační rovnováha řešičem, pH |
| 05_…/R4-kabel | elektrikář | 2D interpolace korekčních součinitelů, nejmenší vyhovující průřez, komplexní impedance a úbytek napětí |
| 05_…/R18-termistor-interpolace | elektrikář | odpor termistoru NTC mezi body katalogové tabulky zkratkami jako v MATLABu (`interp1`, `spline`, `pchip`), konstanta B z tabulky a model B s teplotou převedenou na K (`T | K`), chyby metod proti přesnému modelu, graf chyby po celém rozsahu; teorie v Podkladech (lomená čára a odhad chyby, spline not-a-knot, pchip, Rungeho jev, model B a citlivost) |
| 11_…/R25-ztrata-vetranim | TZB | reálný příklad (V. Zmrhal, J. Boháč, VVI 2/2021, ČVUT): tepelná ztráta větráním rodinného domu s rovnotlakým větráním a rekuperací podle ČSN EN 12831-1, univerzální postup: infiltrace obálkou ze vzduchotěsnosti n₅₀, teplota za ZZT, ztráta nuceným větráním a převodem vzduchu; obývací pokoj rozepsaný, všechny místnosti v tabulce listu s počítanými sloupci a součty Σ; výsledek 725 W jako zdroj; **odhalil chybu jádra: záporná teplota ve °C** (−15 °C se četlo jako −288 K); teorie v Podkladech s odvozením (1 − η) a Pythonem; schéma nakreslil pomocník na Haiku |
| 11_…/R26-izolace-potrubi | TZB | reálný příklad (stanovisko SEI, TZB-info, článek 4564, příklad 1): ekonomicky optimální tloušťka izolace potrubí ÚT DN 40, pět tlouštěk pouzder jako **varianty výpočtu** (`table Izolace: {variants=50mm}`), střední teplota vody ekvitermně, střední reálná cena tepla za 2 roky, U₀ válcové stěny, `compare(Izolace, …)` porovná náklady a `find_min` vybere 50 mm (237,47 Kč/m jako zdroj); ve zdroji překlep D = 0,0683 m (správně 0,0883 m); teorie a Python v Podkladech; řez nakreslil pomocník na Haiku |
| 08_…/R27-zkouska-tahem | materiály | reálný příklad (VUT v Brně, ÚMVI, Mezní stavy materiálu, cvičení 4, příklad 2; zdroj bez výsledků): vyhodnocení zkoušky tahem oceli 11 458, R_p0,2, R_m, zúžení, tažnost A_5,65 a z delší měrné délky, skutečné napětí při lomu, resilience, tahová houževnatost a míra zpevnění; teorie a Python v Podkladech |
| 09_…/R28-nastaveni-regulatoru | automatizace | reálný příklad (picuino.com, Ziegler–Nichols method, metoda kritického zesílení): konstanty regulátorů P, PI, PD, PID jako **varianty** a jejich `compare`; ve zdroji nejednotné zaokrouhlení periody 5,25/5,3 s |
| 10_…/R29-soustruzeni | výroba | reálný příklad (Čirčová, Ižol: Malá zbierka príkladov z technológie obrábania, TU Košice 2004, př. 1): otáčky, strojní čas, přeostření nože RO a spotřeba destiček SK, nástroje jako **varianty**, `floor`/`ceil` |
| 12_…/R30-delka-cyklu | doprava | reálný příklad (NIATT Traffic Signal Timing Lab Manual, University of Idaho): Websterova optimální délka cyklu 80 s, rozdělení zelené (náš doplněk), stupeň saturace, graf cyklu podle Y |
| 13_…/R31-rajon | geodézie | reálný příklad (PřF UK, výpočet rajónu): směrník atan2 v S-JTSK, **jednotka gon** (doplněná do jádra), souřadnice nového bodu na centimetr jako zdroj; ve zdroji překlep 268,45 m |
| 14_…/R32-normalni-hloubka | hydrologie | reálný příklad (Fluid Mechanics ch. 8, University of Mustansiriyah, př. 3 a 4): Manningova drsnost z naměřené hloubky a normální hloubka řešičem, měrná křivka; **jednotka s/m^(1/3)** (zlomkový exponent jednotky doplněný do jádra) |
| 15_…/R33-farmakokinetika | biomedicína | reálný příklad (PHA 5127 Case Study 5, University of Florida, s řešením): jednokompartmentový model po i.v. dávce, k_e, t_1/2, V_d, CL, AUC dvěma způsoby (lichoběžníky přeceňují o 11 %), linearita pro 300 a 750 mg posudky |
| 17_…/R34-nejistota-mereni | obecné | reálný příklad (Z. Budinská, Chyby a nejistoty měření – příklady, ČVUT FS, př. 1 a 4): nejistota typu A (`stdev`), typu B, kombinovaná, šíření nejistoty do plochy průřezu |
| 16_…/R5-fotovoltaika | ekonom | vlastní měna, kurz k datu z tabulky, řady peněžních toků, NPV, IRR, doba a datum návratnosti |
| 01_…/R7-kvadraticka-rovnice | výuka | kvadratická rovnice jako na papíře: podmínka řešitelnosti, kořeny s dosazením, Vietovy vzorce, rozklad, vrchol přes derivaci, tečna s úhlem, plocha mezi kořeny, graf s body a šrafováním, posuvníky koeficientů |
| 01_…/R8-quadratic-equation | výuka | totéž v angličtině (soubor `*.en.cc` se tiskne anglicky) |
| 01_…/R17-prolozeni-parabolou | výuka | proložení pěti bodů parabolou metodou nejmenších čtverců s postupem (`fit(…, kind: "poly2", steps: true)`: součty mocnin, soustava normálních rovnic obecně i s čísly, koeficienty), srovnání s přímkou součtem čtverců odchylek, graf bodů a obou křivek; teorie v Podkladech (odvození normálních rovnic ověřené derivací, přímka jako zvláštní případ, R²) |
| 01_…/R19-plochy-3d | výuka | plochy z(x, y) jako mapa s vrstevnicemi i ve 3D: polokoule, rotační elipsoid, paraboloid, kužel, anuloid (díra uprostřed, okraje dohledané), sedlo a vlnová plocha; řezy (`cut:`), body na ploše, objemy rotačních těles integrálem přes plátky ověřené vzorci (Archimedes, Pappova věta) |
| 02_Fyzika/R10-stlaceni-hydrostatickym-tlakem | fyzik | reálná úloha (Sbírka řešených úloh, č. 2155): hydrostatický tlak, Hookův zákon, diferenciály jako vztahy (`relation`) a odvození z nich, trojný integrál přes objem, čísla rovnic (1)–(9) jako ve sbírce |
| 02_Fyzika/R13-rychlost-z-namereneho-zrychleni | fyzik | reálná úloha (Sbírka řešených úloh, č. 112): naměřená tabulka v listu, přímka směrnicí i metodou nejmenších čtverců, rychlost a poloha integrací s ověřeným odvozením, grafy bodů a průběhů |
| 02_Fyzika/R23-prechazeni-po-lodce | fyzik | reálná úloha (Sbírka řešených úloh, č. 1136): poloha těžiště před přechodem a po něm jako vztahy, posun loďky odvozený z jejich rovnosti, kontroly dosazením a vyvážení posunutí, grafy polohy přídě a člověka během chůze a posunu podle hmotnosti loďky; teorie v Podkladech (vnitřní a vnější síly, obecné odvození) s ověřením simulací chůze v Pythonu; **obrázek nakreslil pomocník na modelu Haiku** |
| 03_…/04_Technicke_tekutiny/R15-vytok-z-nadrze | strojař | reálná úloha (Sbírka řešených úloh, č. 1154): Bernoulliho rovnice a rovnice kontinuity jako vztahy, Torricelliho vzorec odvozený z nich, doba vyprázdnění integrálem, průběh hladiny a výtoku v grafech; **teorie ve vrstvě Podklady** (`podklady.md`, vzorce v ```` ```kalk ```` ověřené testem) |
| 03_…/01_Kinematika_a_dynamika/R16-raketa | strojař | reálná úloha (Sbírka řešených úloh, č. 2311): Meščerského rovnice jako vztah, největší spotřeba paliva odvozená z podmínky zrychlení na konci hoření, konečná rychlost integrálem zrychlení = Ciolkovského rovnice se ztrátou tíhou, výška dohoření, kontrola tahu na startu; teorie v Podkladech (odvození z bilance hybnosti, tah, přetížení posádky) |
| 03_…/04_Technicke_tekutiny/R21-ztraty-v-potrubi | strojař | reálné úlohy (ZČU v Plzni, Mechanika tekutin I, cvičení 11, př. 4 a 1): příkon čerpadla zahradního rozprašovače (Reynolds, Blasius, Colebrook řešený jako rovnice, místní ztráty, Bernoulliho rovnice s čerpadlem) a průtok paralelní větví, kde se Colebrookova rovnice a rovnost ztrát řeší jako soustava dvou rovnic; ověří předpoklad zdroje λ_A = λ_B a upozorní na překlep ve výčtu součinitelů; teorie v Podkladech |
| 03_…/04_Technicke_tekutiny/R14-sila-vody-na-hraz | strojař | reálná úloha (Sbírka řešených úloh, č. 1152), obecná: tlakové síly na pruh hráze jako řetěz vztahů, odvození síly a momentu z něj, integrály přes výšku, působiště h/3; ukázková čísla a grafy tlaku a zatížení |
| 03_…/03_Vibrace_a_kmitani/R22-kmitani-dvou-hmot | strojař | reálná úloha (University of Iowa, Fundamentals of Vibration, přednáška 4): dvě hmoty a tři pružiny, matice hmotnosti a tuhosti, vlastní frekvence z charakteristické rovnice i jako zobecněná vlastní čísla (`eigenvals(K, M)`), tvary kmitů (`eigenvecs`), volné kmitání z počáteční výchylky jako součet tvarů (`lsolve`), graf rázů a jejich perioda; teorie v Podkladech (pohybové rovnice, tvary, rázy) s ověřením simulací v Pythonu |
| 03_…/02_Pevnost_a_pruznost/R11-napeti-v-nosniku | strojař | reálná úloha (Sbírka řešených úloh, č. 2159): rovnováha jako vztahy a reakce z nich odvozené, průběh momentu s podmínkou, kvadratický moment dvojným integrálem, ohybová čára obou průřezů, napětí po výšce průřezu, grafy; odhalí chybné znaménko ve vzorci (10) sbírky |
| 03_…/02_Pevnost_a_pruznost/R12-prodlouzeni-dratu | strojař | reálná úloha (Sbírka řešených úloh, č. 2091): tíha části drátu jako vztah, napětí a poměrné prodloužení jako odvozené funkce, prodloužení integrálem, grafy napětí a prodloužení po délce |
| 03_…/01_Kinematika_a_dynamika/R9-klikovy-mechanismus | strojař | reálný příklad z článku (Transformační technologie, kap. 31): klikový mechanismus parního motoru, síly a moment jako funkce pootočení, střední moment integrálem, otáčky soustrojí s asynchronním generátorem, průsečíky momentu se středním, přebytek práce a moment setrvačnosti setrvačníku |
| 06_…/R6-fve | energetik | FVE elektricky i ekonomicky v jednom listu: šest tabulek, výběr střídače a kabelu podle více podmínek, 2D korekce, výroba ze sloupce tabulky, měna s kurzem k datu, NPV, IRR, doba a datum návratnosti |
