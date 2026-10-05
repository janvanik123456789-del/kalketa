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
3. **Vyjádření neznámé symbolicky** (`solve` s výsledkem jako definicí), návrat k numerice, kde to nejde.
4. **`roots`, `minimize` / `maximize`, výchozí odhady soustav.**
5. **Potom zpět k podkladům z PDF:** převod vzorců z učebnic do odvození a výsledných rovnic.

## 5. Otázky k rozhodnutí

- Má být úsporný styl **výchozí** pro nové výpočty, nebo zůstane vzdušný?
- Klíčové slovo pro odvození: `derive`, nebo stačí řetěz `==` v definici (`y := a == b == c`)?
- U vyjádřené neznámé ukládat do listu **nový řádek** (viditelný, upravitelný), nebo jen ukazovat výsledek u `solve`?
