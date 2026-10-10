# Řešič obecných rovnic a styly výpočtu (návrh 2026-10-05)

**Stav:** návrh k diskusi, nic není rozhodnuté ani naprogramované. Navazuje na odložené podklady z PDF (`NAPADY-NA-POZDEJI.md`, „Podklady z PDF“): vzorce z učebnic se mají dát převést do tvaru výsledné rovnice a zapsat v Kalketě.

## 1. Co už dnes je

- **`solve`** (kap. 9 jazyka): jedna neznámá v intervalu (bisekce + Anderson–Björck), soustava Newtonem z odhadu `guess`. Hlídá jednotky. Když nenajde kořen, vrátí chybu s vysvětlením.
- **`lsolve(A, b)`**: soustava lineárních rovnic s jednotkami. K tomu `det`, `inverse`, `eigenvals`.
- **Numerika:** `integral(f(x), x: a .. b)`, `derivative`, `sum(…, i: a .. b)`, `find_min` / `find_max` nad tabulkou.
- **Uživatelské funkce** `A(d) := π·d²/4` a bloky.
- **Bloky `kalk` v Podkladech:** vzorec se vysází, ale nepočítá.

**Chybí:** cokoli symbolického. Program neumí z rovnice vyjádřit neznámou, upravit výraz ani ověřit, že dvě strany rovnosti jsou totéž. Neumí ani zapsat obecný součet nebo integrál bez mezí (Σ ΔS·y² jako definici).

## 2. Řešič obecných rovnic: co by měl umět

### 2.1 Vyjádření neznámé (symbolicky, kde to jde)

```text
solve w_lim: w == 5·q·L^4/(384·E·I)        → I := 5·q·L^4/(384·E·w_lim)
solve L: M_Ed == q·L²/8                    → L := sqrt(8·M_Ed/q)   (kladný kořen, jednotky m)
```

- **Symbolicky:** malý algebraický stroj nad stromem výrazu. Umí převrátit operace (+, −, ·, /, ^, sqrt, exp/ln, sin/asin …) a řešit lineární a kvadratické rovnice v neznámé. Výsledek je **nový řádek definice**, kterou jde vytisknout i se vzorcem, takže výpočet zůstává čitelný ručně.
- **Kde to symbolicky nejde** (neznámá vícekrát v nelineárním vztahu, transcendentní rovnice): spadne na dnešní numerický `solve`. Uživatel uvidí, který způsob se použil.
- **Víc řešení** (kvadratická rovnice, goniometrie): program je ukáže všechna a vybere fyzikálně smysluplné. U délky kladné, jinak podle intervalu. Volbu napíše.
- **Jednotky:** výsledek se kontroluje rozměrovou analýzou. Odmocnina z m² dá m, nesoulad je chyba.

### 2.2 Odvození: řetěz rovností s kontrolou

```text
derive M_mp/(E·I) == (l^3·F/3)/(E·I) == F·l^3/(3·E·I)
```

- Zápis odvození jako v učebnici: `a == b == c`. Každý krok program **ověří**, že obě strany jsou si rovny. Nejdřív symbolickým zjednodušením, kde to nejde, číselně v několika náhodných bodech, a vždy rozměrově.
- **V tisku** se odvození vysází jako „y = … = … = …“. Chybný krok se označí jako posudek, který nevyhovuje.
- **Poslední člen** může rovnou definovat veličinu: `y := … == … == F·l^3/(3·E·I)` (dnes model psal přesně tohle).
- **Přínos pro podklady z PDF:** vzorec z učebnice se přepíše jako odvození, program ho ověří a jeho poslední tvar jde rovnou použít ve výpočtu.

### 2.3 Symbolický zápis pro teorii

- **Součet a integrál bez mezí** jako definice veličiny: `I := sum(ΔS·y^2)` vysázené jako Σ ΔS·y², `I := integral(y^2, dS)` jako ∫ y² dS. V Podkladech a v odvození jsou to platné vzorce. Ve výpočtu bez mezí chyba s radou, jak je dát (průřez z tabulky, funkce průřezu).
- **Implicitní rovnice** `f(x, y) == 0` jako popis vztahu, který řešič použije, až je zadané vše ostatní.

### 2.4 Další úlohy řešiče (podle referenčních výpočtů)

- **Kořeny polynomu** `roots(p)` včetně komplexních (R2 vlastní čísla, kmitání).
- **Optimalizace** `minimize f(x) in a .. b` / `maximize` nad funkcí, ne jen nad tabulkou (návrh profilu, ekonom IRR).
- **Soustava bez odhadu:** rozumný výchozí odhad z jednotek a z intervalů, víc startů, když Newton nekonverguje.
- **Později:** diferenciální rovnice (ohybová čára `EI·w'' = −M(x)` s okrajovými podmínkami) numericky, výsledek jako funkce a graf.

### 2.5 Co se nebude dělat

- Plný počítačový algebraický systém (SymPy, Maxima). Symbolika jen tam, kde vede k čitelnému výsledku v ručním tvaru. Jinak numerika s jasnou chybou.
- Skryté zjednodušování vzorců v tisku. Dosazení zůstává vždy kvůli kontrolovatelnosti (rozhodnuto 30. 9. 2026).

## 3. Styly výpočtu: využít místo

Rozhodnuto 30. 9. 2026 (`02-architektura.md`, „Výběr stylu výpočtu“) a upřesněno 5. 10. 2026: **využít místo a pokračovat na jednom řádku, kam až to půjde.**

### 3.1 Styly

- **Vzdušný:** dnešní vzhled, každý krok na svém řádku.
- **Úsporný** (nový, výchozí pro tisk?):
  - **vzorec, dosazení a výsledek na jednom řádku:** `A = π·d²/4 = π·(20 mm)²/4 = 314,2 mm²`. Zalomí se až tam, kde se řádek nevejde, a to **na rovnítku**, další část se odsadí;
  - **víc zadání na řádek:** `L = 6 m   q = 12 kN/m   E = 210 GPa` tak daleko, kam se vejde, se zarovnáním do sloupců, aby se dala číst svisle;
  - **krátké výsledky vedle sebe:** po sobě jdoucí jednoduché definice bez dosazení stejně jako zadání;
  - **posudek na jeden řádek:** `σ = 193 MPa ≤ f_y = 235 MPa → 82 % ✓`.
- **Ruční výjimka:** konec řádku vynucený zápisem v listu (prázdný řádek, nadpis, direktiva `@break`) uloží zalomení i v úsporném stylu.

### 3.2 Co patří do stylu a co ne

- **Styl mění jen sazbu**, nikdy výpočet. Ukládá se v souboru (Vlastnosti výpočtu), takže tisk a PDF vypadají všude stejně.
- **Mezery** mezi řádky a pod nadpisy jsou součást stylu.
- **Okraje a patička** patří do Nastavení stránky.
- **Editor listu** ukazuje stejný styl jako tisk. Upravuje se dál po řádcích: klik na kus řádku otevře jeho zdrojový řádek.

### 3.3 Technicky

- `render` dostane volbu stylu. Tisk skládá **řádkové skupiny**: posloupnost krátkých bloků se vloží do jednoho řádku s plovoucím zalamováním (CSS flex-wrap) a dlouhá rovnice se rozdělí na části mezi rovnítky (MathML v Chromiu sám zalamovat neumí).
- Stránkování (`logic/pages.ts`) počítá s výškou skupin.
- Řešič a odvození (kap. 2) se v úsporném stylu sázejí stejně: řetěz rovností na jednom řádku, zalomený na rovnítku.

## 3a. Průzkum: co vyžadují školy a praxe (2026-10-05)

Prošli jsme veřejné pokyny vysokých škol a profesních organizací:
- **ČVUT FSv:** „Požadavky na statický výpočet“ (předmět BEK3) a „Statický výpočet – postup, zásady“.
- **ETH Zürich:** „Statische Berechnung“, IBK, prof. Marti.
- **Uni Duisburg-Essen:** „Leitfaden zum Aufbau statischer Berechnungen“.
- **Rowan University:** „Engineering Homework Format“.
- **ČKAIT:** TS 05.
- K tomu britská praxe výpočtových listů (IStructE, ukázky firem).

**Shoda všude:**

1. **Vzorec → dosazení → výsledek s jednotkou.**
   - ČVUT: „ve výpočtu nejprve napsaný použitý vzorec a dále do něj dosazeno až pak výsledek (vzorce bez dosazení nebudou uznány nedá se to kontrolovat)“.
   - ETH: vzorec při prvním použití algebraicky, pak dosadit čísla.
   - Rowan: jednotky u každého členu rovnice.
   - Kalketa to dělá už dnes a zůstane to ve všech stylech.
2. **Výsledky zvýrazněné, „aby byly na první pohled poznat“** (ETH). Rowan je dává do rámečku, Duisburg zvýrazňuje rozhodující výsledky.
3. **Rozumné zaokrouhlení:** 2–3 platné číslice, „žádná zdánlivá přesnost“ (ETH, Rowan). Kalketa má dnes výchozí 4.
4. **Odkazy na normy a zdroje** u vzorců, které nejsou běžné (ETH), a u převzatých veličin význam a zdroj (ETH). Všude seznam použitých norem a programů s verzí.
5. **Kontrolovatelnost a přehlednost** jako hlavní měřítko (ČVUT, ČKAIT, Duisburg „prüfbar“).
6. **Číslování stran** po oddílech, u vložených stran písmeno (ETH „1.3.2A“). **Hlavička** se jménem, datem a stranou x/y (Rowan, britské listy).
7. **Výsledek posudku slovem:** VYHOVÍ / NEVYHOVÍ (ČVUT).
8. **Rekapitulace zatížení v tabulce:** charakteristická hodnota, součinitel, návrhová hodnota (ČVUT, vzor BEK3).
9. **Skici a schémata** u výpočtu (všude). **Pozice** (číslo prvku) jako osa členění (německá „Positionsstatik“).

**Rozdíly, které stojí za styly:**

- **Česká a německá škola:** výpočet souvisle shora dolů, výsledky zvýrazněné v textu, posudek s VYHOVÍ / NEVYHOVÍ.
- **Britský výpočtový list:** stránka rozdělená na **sloupce**. Vlevo odkazy (článek normy, zdroj), uprostřed výpočet, vpravo výsledek. Kontrolor čte jen pravý sloupec a ke každému číslu najde v levém zdroj. (Tradiční tištěné bloky „Ref / Calculations / Output“. Z dostupných ukázek se nám rozvržení nepodařilo ověřit, je to obecně známá praxe.)
- **Americké školní úlohy:** Given / Find / Solution / Answer, odpověď v rámečku.

**Co z toho plyne pro Kalketu:** styl nemá být libovolná vizuální volba. Má to být **předvolba podle zavedené praxe**. Pevný základ zůstává ve všech stylech: vzorec → dosazení → výsledek s jednotkou, zdroje, posudky. Navrhované styly:

| Styl | Pro koho | Co dělá |
|---|---|---|
| **Školní / úsporný** | české a německé školy, běžná praxe | výpočet na jednom řádku (vzorec = dosazení = **výsledek**, zalomení na rovnítku), víc zadání na řádek, zvýrazněný výsledek, VYHOVÍ / NEVYHOVÍ, 3 platné číslice |
| **Se sloupci** | britská praxe, kontrola projektu | vlevo zdroj (`source`, citace podkladů), uprostřed výpočet, vpravo výsledky a posudky; kontrolor čte pravý sloupec |
| **Vzdušný** | dnešní vzhled, výuka krok za krokem | každý krok na svém řádku |

Ve všech stylech hlavička (název, autor, datum, strana x/y, revize), číslování po oddílech a tabulka rekapitulace zatížení jako běžný prvek listu.

**Zdroje:** ČVUT FSv people.fsv.cvut.cz/broukiva (vzor_stat_vyp.pdf, stat_vyp_postup_zasady.htm); ETH archiv.ibk.ethz.ch (Richtlinie_statische_Berechnungen.pdf); uni-due.de/imperia/md/content/iml/aufbau_statischer_berechnungen.pdf; users.rowan.edu/~everett (HW Format 14.pdf); profesis.ckait.cz (TS 05); istructe.org (Calculation models).

## 3b. Rozhodnuto 2026-10-05: varianty stylů

1. **Školní / úsporný: výchozí pro výpočty.** Řetěz vzorec = dosazení = **výsledek** na jednom řádku se zalomením na rovnítku, víc zadání na řádek, posudek na jednom řádku, VYHOVÍ / NEVYHOVÍ, zarovnání vlevo, jednotky u dosazení. Programuje se první.
2. **Knižní: varianta školního pro teorii, skripta a řešené příklady** (vrstva Podklady, knihovny `.kalkt`). Vzorce na střed s **číslem rovnice vpravo** (43), odkazy na čísla rovnic v textu („podle vztahu (34)“), odvození řetězem rovností, jednotky často jen u výsledku. Odpovídá učebnicím, ze kterých podklady pocházejí, a výpočet na ně může odkazovat čísly rovnic.
3. **Se sloupci:** vlevo zdroj, uprostřed výpočet, vpravo výsledky a posudky (kontrola projektu, britská praxe).

**Vzdušný** (dnešní vzhled) zůstává jako čtvrtá možnost.

## 4. Navržené pořadí

1. **Styly výpočtu (úsporný styl):** hned viditelný přínos pro každý výpočet, nezávisí na řešiči.
2. **Odvození `derive` s ověřením kroků** (číselně a rozměrově) a **symbolický zápis Σ / ∫ bez mezí** pro teorii. **Hotovo 2026-10-05** (jazyk, kap. 9.1). Rozhodnuto: `y := a == b == c` i `derive …`; kroky se ověřují obecně náhodnými hodnotami, krok s dosazenými čísly hodnotami výpočtu; chybný krok je chyba, hodnota se spočítá z posledního členu; dvoučlenné `y := a == b` je odvození, s textem nebo logickou hodnotou porovnání; `derive M_mp := …` zavede značku teorie; Σ a ∫ bez mezí jsou v odvození lineární.
3. **Vyjádření neznámé symbolicky** (`solve` s výsledkem jako definicí), návrat k numerice, kde to nejde. **Hotovo 2026-10-05** (jazyk, kap. 9). Rozhodnuto: vzorec se do listu nevkládá sám, nabídne ho pravé tlačítko na řádku `solve`; dva kladné kořeny bez intervalu jsou chyba s výpisem obou.
4. **`roots`, `minimize` / `maximize`, výchozí odhady soustav.** **Hotovo 2026-10-05** (jazyk, kap. 7.1c a 9): `roots(p, x)` i komplexní, `minimize`/`maximize(f, x: a .. b)` vrací místo extrému, soustavy zkouší víc startů. Jednotky neznámých soustavy bez odhadu zatím neodvozuje.
4a. **Před bodem 5 (rozhodnuto 2026-10-05 večer, z testu výpočtu nýtu):**
   - **Hotovo 2026-10-06 (obojí):** jednotky výsledků (jazyk 4.2a) i nerovnice v `solve` (jazyk 9).
   - **Nerovnice v `solve`:** `solve d: S_min ≤ π·d²/4` vytiskne `S_min ≤ π·d²/4 ⇒ d ≥ √(4·S_min/π) = 5,473 mm`, jako sbírka (s. 38). Při dělení či násobení záporným a u sudých odmocnin se znaménko nerovnosti hlídá.
   - **Jednotky výsledků (chyba se vrátila):** `F/τ` (N, MPa) ukáže `N/MPa` místo mm²; `√(4·S/π)` s S v mm² dá metry místo mm; `sqrt(a² + b²)` s a, b v mm dá metry; `M/W` (N·mm, mm³) dá Pa místo MPa. Pravidlo: jednotka podílu se nesmí skládat ze dvou různých druhů (N/MPa); složená jednotka se nahradí běžnou jednotkou téže velikosti (N/MPa = mm², N·mm/mm³ = MPa); odmocnina z mocniny jednotky jednotku zachová (√mm² = mm); metry se objeví jen tam, kde se v metrech počítalo. Kód: `composedHint`, `samePowerHint`, `poweredHint` v `packages/core/src/eval/evaluator.ts` a funkce sqrt/cbrt v `functions/modules.ts`; jazyk kap. 4.2a.
4b. **Hotovo 2026-10-06 jinak, než se plánovalo:** obecná tabulka přímo v listu (`table Mereni:`, jazyk 8.4), `fit` a graf bodů s křivkou (jazyk 7.1f). Katalogové tabulky zůstávají ve vrstvě Data. Kosmetika (úprava v mřížce, formáty jako v Excelu, vlastní tvar fit) na později. Původní záměr: **Tabulka ve výpočtu (rozhodnuto 2026-10-05, po 4a, před bodem 5):** řádek `table(Tabulka)` nebo `table(Profily_IPE, columns: [h, b, W_y], where: W_y ≥ 150 cm³)` vysází tabulku z vrstvy Data na tomto místě listu (záhlaví s jednotkami, jen vybrané sloupce a řádky); řádek zvolený ve výpočtu (`pick`, `find_min`) se zvýrazní; umístění jako obrázek (na střed, obtékání). Dnes jde tabulka do tisku jen jako příloha celé vrstvy. Druhý krok: rekapitulace zatížení, tabulka sestavená z hodnot výpočtu (charakteristická hodnota, součinitel, návrhová hodnota; ČVUT).
4c. **Z testování 2026-10-06 (uživatel), udělat před bodem 5:**
   - **Definiční rovná se (≔) na panel Operátory**, jako první ikona nad „·“ (krát). Při psaní se místo definičního `:=` občas vloží obyčejné `=` a oprava trvá dlouho. **Hotovo 2026-10-06:** tlačítko ≔ první na panelu Operátory (starší rozvržení ho dostane), vloží ` := ` na místo kurzoru, na prázdném řádku i nové jméno; Vložit → Definice v otevřeném řádku dělá totéž.
   - **Tabulky: Enter v buňce** potvrdí údaj a kurzor skočí o buňku níž (jako v Excelu), na posledním řádku přidá nový; Tab o buňku vpravo. Platí pro editor tabulek (panel Tabulky, vrstva Data) i pro budoucí úpravu tabulky v listu v mřížce. **Hotovo 2026-10-06** v panelu Tabulky: Enter dolů, Shift+Enter nahoru, Tab vpravo. Na posledním řádku Enter přidá nový (hotovo 2026-10-09). Mřížka tabulky v listu hotova 2026-10-09: klik na tabulku v listu ji otevře jako mřížku (záhlaví název [jednotka] {formát}, buňky, + řádek, + sloupec, × u řádků a sloupců, „Upravit jako text“), Enter dolů / na posledním řádku nový řádek, Shift+Enter nahoru, Tab vpravo, Esc konec; text listu se píše se zarovnanými sloupci. Vložit → Tabulka v listu. Tabulka psaná v textu zůstává v textu, mřížka se otevře jen u řádku, který už tabulkou je.
   - **Mazání řádků:** Ctrl+Shift+K je krkolomné. Řádky listu označit (klik na řádek nebo jeho číslo, Shift+klik rozsah, Ctrl+klik jednotlivé, tažení přes čísla řádků) a smazat klávesou Delete; v otevřeném řádku Delete dál maže znaky. Ctrl+Shift+K může zůstat. **Hotovo 2026-10-06:** Ctrl+klik označí řádek, Shift+klik rozsah, Delete (i Backspace) je smaže v jednom kroku zpět, Esc výběr zruší. Tažení přes čísla řádků se stisknutým tlačítkem hotovo 2026-10-09.
   - **AI neví, jak se zapisuje text.** Popis jazyka pro model (`languageGuide` v `packages/editor/src/logic/aiContext.ts`) má o textu jen větu „a line in "quotes" is printed text“. Doplnit příklady a pravidla: text je celý řádek v dvojitých uvozovkách (`"Zatěžující síla"`), nikdy holá věta bez uvozovek; popis k hodnotě jako komentář za `'` (`L := 5 m ' rozpětí`); nadpisy `#`/`##`; text se nepočítá. Totéž v návodu pro nový list (blok ```` ```sheet ````). Pozorováno: model zápis nepopletl, ale dlouho přemýšlel, jak text zapsat; krátký vzorový list (nadpis, text, definice s komentářem, posudek) v návodu ušetří čas i tokeny. **Hotovo 2026-10-06:** pravidla textu v návodu a fragmentové vzory listu (`SHEET_FRAGMENTS`: nadpisy a text, definice a výsledek, nerovnice, rovnice v intervalu, posudek, odvození, tabulka s `fit` a grafem); test hlídá, že každý fragment projde bez chyby. Návod jde do každého dotazu, tedy i pro blok ```` ```sheet ````. K tomu volba hloubky přemýšlení „žádná“ pro místní servery (`reasoning_effort: "none"` a `chat_template_kwargs.enable_thinking: false`; Claude ji bere jako low).
   - **Vzory pro model ve dvou úrovních (rozhodnuto 2026-10-06):** (1) krátký vzorový list přímo v návodu, vždy (asi 15 řádků: nadpis, text, definice s komentářem, tabulka v listu, `solve`, posudek; pár set tokenů); (2) vzorové příklady (`reference/`) jako vestavěná knihovna, ze které model dostane jen relevantní úseky stejným hledáním jako knihovny teorie (BM25), jen když jsou k věci. Později do ní i vlastní ověřené výpočty uživatele, aby model psal v jeho stylu. Celé vzory do každého dotazu ne (tisíce tokenů, malý kontext lokálních modelů). Úroveň (1) hotova 2026-10-06 jako fragmenty (viz výše). Úroveň (2) **odložena 2026-10-10 (uživatel):** nejdřív dopracovat možnosti listu, vzory pak budou ukazovat hotový jazyk.
   - **Chyba:** Vložit → Definice (z horního menu) vkládá `:=` na nový řádek, ne do místa, kde bliká kurzor. Má se chovat jako ostatní symboly: v otevřeném řádku vložit na místo kurzoru, nový řádek jen když žádný řádek otevřený není. **Hotovo 2026-10-06.**
4d. **Formát řádku z pravého tlačítka (uživatel 2026-10-08):** pravé tlačítko na řádku listu otevře editační menu s tím, co jde u daného druhu řádku nastavit.
   - **Výsledek:** počet desetinných míst (dnes jen `@digits` = platné číslice, a to jako přepínač pro všechny další řádky), dále asi jednotka zobrazení (`| kN·m`), s dosazením / bez / jen výsledek, skrýt v tisku.
   - **Text:** velikost, typ písma, kurzíva, tučné (dál barva, zarovnání).
   - **Návrh zápisu:** formát patří do textu listu (text listu je pravda, jde do souboru, diffu i AI), menu ho jen píše. Atributy na konci řádku ve složených závorkách, stejně jako už u obrázků (`{width=56% wrap=right}`): `σ_k := R_m/2 | MPa  {decimals=1}`, `"Volíme průměr nýtu 6 mm." {size=12 italic bold font=serif}`. V editoru se atributy nezobrazují jako text, jen se projeví. Kurzíva části textu později jako `*…*` uvnitř uvozovek. Výchozí hodnoty dál z nastavení tisku (`layout.json`), řádek je jen přepíše.
   - **Otázka:** desetinná místa (pevně 2 → 5,47 mm) vedle platných číslic (`@digits 3` → 5,47 mm, ale 23,5 mm²) — obojí, v menu volba „desetinná místa / platné číslice“.
   - **Etapa 1 hotova 2026-10-09:** `{decimals=n}` / `{digits=n}` na konci řádku, pravé tlačítko na řádku s výsledkem nebo posudkem → Zobrazení výsledku: výchozí / Desetinná místa 0–4 / Platné číslice 2–6. Platí pro výsledek řádku i pro dosazení té veličiny níže; výpočet zůstává přesný; neznámý formát je varování W-FORMAT. **Etapa 2 hotova týž den:** u textu `{size=12 font=serif|sans|mono italic bold}`, pravé tlačítko na textovém řádku → Vzhled textu: výchozí / Velikost písma / Písmo / Kurzíva / Tučné. Týž den i barva (šedá, modrá, červená, zelená) a zarovnání, `*kurzíva*` a `**tučné**` uvnitř textu, styl nadpisů a formát pro všechny označené řádky najednou (pravé tlačítko na označeném řádku).
   - **Upraveno 2026-10-09 (uživatel):** menu ukazuje jen desetinná místa, každou volbu s ukázkou výsledku („Výsledek na 2 desetinná místa (5,47 mm)“); platné číslice mátly, zůstávají jen zápisem `{digits=3}` v textu. Nové zaškrtnutí „Počítat dále se zaokrouhlenou hodnotou“ (`rounded`): řádky níže počítají se zobrazenou hodnotou, výsledek je pak součtem zobrazených hodnot. Bez něj platí rozhodnutí níže.
   - **Rozhodnuto 2026-10-08 (uživatel):** zaokrouhlení je jen **zobrazení**. Platí pro výsledek na jeho řádku i pro jeho dosazení do dalších vzorců (`S_min = 23,53 mm²` a dál `π·d²/4 ≥ 23,53 mm²`). Výpočet pod kapotou běží vždy nezaokrouhlený; jeho přesnost (vnitřní: tolerance řešičů, iterací, kontrol odvození; číslo je double, asi 15 platných číslic) se nastavuje v nastavení programu, ne u řádku. Důsledek pro tisk: dosazení zaokrouhlených čísel může dát v poslední číslici jiný výsledek než výpočet (5,474 vs 5,473 mm); zvážit poznámku v tisku nebo o číslici víc u dosazení.
   - **Konkurence (ověřeno 2026-10-08):** Mathcad Prime má výchozí formát pro celý list (General, 3 desetinná místa, bez koncových nul) a každý výsledek ho může přepsat; zobrazí nejvýš 15 míst. SMath Studio nastavuje desetinná místa globálně (Nástroje → Možnosti → Výpočty) i u jednoho výsledku z pravého tlačítka; slabina: přepsané výsledky nejde hromadně vrátit k výchozímu. Calcpad má `#round n` (0–15 míst) a pole Zaokrouhlení v okně programu, uvnitř počítá s plnou přesností a v nápovědě sám přiznává, že přepočet z čísel v protokolu dá malé rozdíly. Excel: formát buňky jen zobrazuje; volba „Nastavit přesnost podle zobrazení“ hodnoty nevratně zaokrouhlí, nepřebírat. **Pro Kalketu:** v menu volba „výchozí“ (atribut zruší) a nastavení pro víc označených řádků najednou.
4e. **Odvození podle vzoru ze sbírky (2026-10-08, úloha reseneulohy.cz 2155 „Krychle na dně pod vodou“):** list `Testovaci_priklady/Krychle_pod_vodou.cc` počítá ΔV = −3,27·10⁻¹¹ m³ jako sbírka a odvození (8) → (9) přes trojný integrál projde kontrolou ve všech krocích. **Opraveno týž den:** kontrola kroků rozvine funkce listu do jejich vzorců (`ε_xx(z)` → `−ρ·g·(h − z)/E`), dřív je brala s hodnotami listu a krok s nimi „neplatil“; mínus u čísel s mocninou deseti v tisku. **Zbývá:**
   - ~~odvození v definici funkce~~ **hotovo 2026-10-09:** `dV_rel(z) := … == … == …`; parametr se při kontrole mění jako symbol v rozměru, se kterým mají všechny členy hodnotu (z v h − z: délka); funkce se tiskne bez dosazení;
   - diferenciály a vztahy mezi nimi (`dV − dV_0 = (2·ε_xx + ε_zz)·dV_0`, kroky (3), (4)) jako zápis teorie bez hodnoty;
   - tisk: ~~`−ρ·g/E` jako `(−ρ·g)/E`~~ mínus stojí před zlomkem (hotovo 2026-10-09); řádek `ΔV | m³` je v listu i tisku v pořádku (zdvojení bylo jen v textovém výpisu testu); čísla rovnic (1)–(9) vpravo hotova 2026-10-09: Vlastnosti výpočtu → Čísla rovnic, u řádku `{eq}`, `{noeq}`, `{eq=jméno}` a odkaz `(#jméno)` v textu a knižní styl (Vlastnosti výpočtu → Styl: knižní) se vzorci na střed, který čísla vzorců zapne sám, také hotov 2026-10-09;
   - diferenciály: vztah `dV − dV₀ = (2·ε_xx + ε_zz)·dV₀` není rovnost dvou tvarů, ale definice; jde zapsat jako značka teorie `derive dV(z) := dV_0·(1 + 2·ε_xx(z) + ε_zz)`.
5. **Potom zpět k podkladům z PDF:** převod vzorců z učebnic do odvození a výsledných rovnic. **Rozhodnuto 2026-10-05, další na řadě.** Postup (po prozkoumání `E:\AI\Projekt_vypoctare\kalketa-ai-adapter`, samostatný nástroj jiného modelu; kód se nepřebírá):
   1. `cleanFormula` (`packages/ai/src/formulas.ts`) a návod pro model (`formulaPrompt`) upravit tak, aby zachovaly vztahy a řetězy rovností jako odvození (`derive …`, `y := a == b == c`), ne aby z `V_max == M_max / h` dělaly definici. Test `packages/ai/tests/formulas.test.ts` dnes řetěz rozděluje, to se změní.
   2. Hromadný převod výřezů vzorců kapitoly na pozadí: průběh, pokračování po přerušení (hotové přeskočit), opakování přechodných chyb s prodlevou, vyšší limit tokenů pro čtení obrázků (dnes `max_tokens: 4096` v `askAboutImage`, přemýšlející modely ho přetečou).
   3. Převedené vzorce v Podkladech ověřit jako odvození (bloky ```` ```kalk ```` dnes jen vysází), aby bylo vidět, kde model přečetl vzorec špatně.
   4. Volitelně popisy obrázků (alt-text) pro hledání v teorii.
   **Kroky 1–3 hotovy 2026-10-10:** (1) řetěz rovností zůstává jedním řádkem odvození teorie `derive y := a == b == c` (návod pro model to říká, `toKalk` převádí i řetěz zapsaný jinak); (2) převod výřezů tlačítkem ƒx ✦ v Podkladech už šel po všech výřezech bez vzorce a hotové přeskakuje (pokračování po přerušení), nově: opakování při přechodné chybě (server neběží, 5xx, prázdná odpověď) po 3 a 10 s, limit 16 384 tokenů u místních modelů, hloubka přemýšlení z nastavení (i „žádná“), stejné tlačítko převod zastaví po rozpracovaném vzorci; (3) bloky ```` ```kalk ```` v Podkladech se sázejí celým řetězem a kontrolují jako odvození (celý blok najednou, značky `derive M_mp := …` platí pro řádky pod nimi): „✓ odvození ověřeno“, nebo „⚠ krok n nesouhlasí: špatně přečtený vzorec, nebo dosazení jiného vztahu“. **Krok 4 hotov 2026-10-10:** tlačítko 🖼 ✦ v Podkladech nechá AI napsat ke každému obrázku bez popisu, co ukazuje (jazykem uživatele, krátká fráze), a zapíše ho za obrázek jako `{alt="…"}`; viditelný popisek se nemění, popis je text obrázku (alt, bublina) a slova oddílu pro hledání v teorii. Výřezy vzorců (`vzorec-…`) se vynechají, hotové se přeskočí, stejné tlačítko zastaví, chyby se opakují jako u vzorců. **Doplněno týž den (uživatel):** převedený vzorec se potvrzuje tlačítkem „✓ Potvrdit vzorec“ u bloku (zmizí poznámka AI s ✦); potvrzený blok se v Podkladech ukáže jako v PDF: vysázený na střed ve stylu řádku listu, s číslem rovnice z knihy vpravo (převod ho zachová jako `{eq=32}`), zápis skrytý, dokud v bloku není kurzor (klik na vzorec ho otevře), výřez nad ním sbalený do odkazu „▸ výřez z PDF“. Index z více částí (τ_Sk,s) převod zapíše jako `τ_Sk_s`. **Popisy obrázků upraveny týž den (uživatel: popis byl mimo a nedostatečný):** model dostane s obrázkem text Podkladů kolem něj (asi 2000 znaků před, 1000 za, s místem obrázku a jeho popiskem) a napíše 2–4 věty: co obrázek ukazuje a jak ho kniha nazývá (Obr. 25 Prostý smyk), co je nakresleno (těleso, síly a veličiny se značkami) a co vysvětluje vzhledem k textu; jazykem okolního textu (česky být nemusí). Vybraný obrázek se popíše znovu i s popisem.
   Zkušenost z adaptéru (strana 45 sbírky): celá strana při měřítku 0,8 se uřízla (limit tokenů, 125 s), výřez při 1,6 dal 2 vzorce za 150 s (qwen 9B), model 35B vypršel po 480 s. Kalketa ukládá výřezy už ořezané na 200 DPI.

## 5. Otázky k rozhodnutí

- Má být úsporný styl **výchozí** pro nové výpočty, nebo zůstane vzdušný?
- Klíčové slovo pro odvození: `derive`, nebo stačí řetěz `==` v definici (`y := a == b == c`)?
- U vyjádřené neznámé ukládat do listu **nový řádek** (viditelný, upravitelný), nebo jen ukazovat výsledek u `solve`?
