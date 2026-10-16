# Referenční výpočty

Každý referenční výpočet (R1–R14, viz docs/01-filozofie.md, kap. 10) má vlastní složku
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

Jádro je hotové, až projdou všechny bez kódu specifického pro jeden obor.

| Složka | Obor | Co ověřuje |
|---|---|---|
| 04_…/R1-nosnik | stavař | výběr profilu z tabulky, posudky, nejlehčí vyhovující profil |
| 03_…/05_Tepelne_vypocty/R2-vymenik-hridel | strojař | °C a rozdíly teplot, logaritmický teplotní spád, vlastní funkce, řešič pro nejmenší průměr, materiál z tabulky |
| 07_…/R3-roztok | chemik | tabulka látek (molární hmotnost), ředění, disociační rovnováha řešičem, pH |
| 05_…/R4-kabel | elektrikář | 2D interpolace korekčních součinitelů, nejmenší vyhovující průřez, komplexní impedance a úbytek napětí |
| 16_…/R5-fotovoltaika | ekonom | vlastní měna, kurz k datu z tabulky, řady peněžních toků, NPV, IRR, doba a datum návratnosti |
| 01_…/R7-kvadraticka-rovnice | výuka | kvadratická rovnice jako na papíře: podmínka řešitelnosti, kořeny s dosazením, Vietovy vzorce, rozklad, vrchol přes derivaci, tečna s úhlem, plocha mezi kořeny, graf s body a šrafováním, posuvníky koeficientů |
| 01_…/R8-quadratic-equation | výuka | totéž v angličtině (soubor `*.en.cc` se tiskne anglicky) |
| 02_Fyzika/R10-stlaceni-hydrostatickym-tlakem | fyzik | reálná úloha (Sbírka řešených úloh, č. 2155): hydrostatický tlak, Hookův zákon, diferenciály jako vztahy (`relation`) a odvození z nich, trojný integrál přes objem, čísla rovnic (1)–(9) jako ve sbírce |
| 02_Fyzika/R13-rychlost-z-namereneho-zrychleni | fyzik | reálná úloha (Sbírka řešených úloh, č. 112): naměřená tabulka v listu, přímka směrnicí i metodou nejmenších čtverců, rychlost a poloha integrací s ověřeným odvozením, grafy bodů a průběhů |
| 03_…/04_Technicke_tekutiny/R14-sila-vody-na-hraz | strojař | reálná úloha (Sbírka řešených úloh, č. 1152), obecná: tlakové síly na pruh hráze jako řetěz vztahů, odvození síly a momentu z něj, integrály přes výšku, působiště h/3; ukázková čísla a grafy tlaku a zatížení |
| 03_…/02_Pevnost_a_pruznost/R11-napeti-v-nosniku | strojař | reálná úloha (Sbírka řešených úloh, č. 2159): rovnováha jako vztahy a reakce z nich odvozené, průběh momentu s podmínkou, kvadratický moment dvojným integrálem, ohybová čára obou průřezů, napětí po výšce průřezu, grafy; odhalí chybné znaménko ve vzorci (10) sbírky |
| 03_…/02_Pevnost_a_pruznost/R12-prodlouzeni-dratu | strojař | reálná úloha (Sbírka řešených úloh, č. 2091): tíha části drátu jako vztah, napětí a poměrné prodloužení jako odvozené funkce, prodloužení integrálem, grafy napětí a prodloužení po délce |
| 03_…/01_Kinematika_a_dynamika/R9-klikovy-mechanismus | strojař | reálný příklad z článku (Transformační technologie, kap. 31): klikový mechanismus parního motoru, síly a moment jako funkce pootočení, střední moment integrálem, otáčky soustrojí s asynchronním generátorem, průsečíky momentu se středním, přebytek práce a moment setrvačnosti setrvačníku |
| 06_…/R6-fve | energetik | FVE elektricky i ekonomicky v jednom listu: šest tabulek, výběr střídače a kabelu podle více podmínek, 2D korekce, výroba ze sloupce tabulky, měna s kurzem k datu, NPV, IRR, doba a datum návratnosti |
