# CalcCanvas — Jazyk výpočtu

**Verze:** 0.1 (návrh pro fázi F1 a F2)
**Datum:** 2026-09-29
**Navazuje na:** [01-filozofie.md](01-filozofie.md), [02-architektura.md](02-architektura.md)

Tento dokument popisuje textovou podobu výpočtu uloženou v `sheet.cc`. Uživatel ji v editoru uvidí jako sázené vzorce a v tisku jako klasický technický výpočet.

Každé rozhodnutí u sebe uvádí, **odkud je převzaté** (konkurence), nebo **proč je jiné**.

---

## 1. Ukázka (referenční výpočet R1)

```text
# Posouzení nosníku N1

## Zadání
L := 5 m                               ' rozpětí
q := 12 kN/m                           ' spojité zatížení
material := pick(Materialy, "S235")
profil   := pick(Profily_IPE, "IPE 200")

## Výpočet
M_Ed := q·L²/8                   | kN·m
σ    := M_Ed / profil.Wy         | MPa
w    := 5·q·L⁴ / (384·material.E·profil.Iy)   | mm

## Posouzení
check "Ohyb":   σ ≤ material.fy        source "EN 1993-1-1, 6.2.5"
check "Průhyb": w ≤ L/250              source "EN 1990, A1.4"
```

V tisku (s dosazením):

```text
M_Ed = q·L²/8 = 12 kN/m · (5 m)² / 8 = 37.5 kN·m
σ = M_Ed / Wy = 37.5 kN·m / 194 cm³ = 193.3 MPa
Ohyb: σ = 193.3 MPa ≤ fy = 235 MPa   využití 82 %  ✓   [EN 1993-1-1, 6.2.5]
```

---

## 2. Základní pravidla zápisu

| Prvek | Zápis | Poznámka |
|---|---|---|
| Definice | `a := 5 m` | Jako Mathcad. Odlišuje definici od rovnice. V editoru stačí napsat `=` za novým jménem na začátku řádku, editor sám vloží `:=` a zobrazí ho jako `≔` (rozhodnuto 2026-09-29). |
| Zobrazení výsledku | `a =` nebo jen `a` na řádku | Vypíše hodnotu |
| Rovnice pro řešič | `x² + 2·x == 8` | viz kap. 9 |
| Komentář | `' text` | Převzato z Calcpadu a Mathcadu |
| Nadpisy | `#`, `##`, `###` | Známé z Markdownu, v tisku kapitoly |
| Volný text | řádek bez výrazu v uvozovkách `"…"`, nebo blok `text: …` | v tisku odstavec |
| Cílová jednotka | `výraz \| kN·m` | **Převzato z Calcpadu.** Určuje jednotku zobrazení. |
| Pořadí | proměnná musí být definovaná **výše** | Čte se shora dolů jako technický výpočet. Graf závislostí přesto přepočítává jen potřebné. |

**Opakovaná definice** stejného jména je chyba. Na rozdíl od Calcpadu, kde se proměnná přepíše, by u nás přepsání rozbilo dohledatelnost (provenance): každé jméno musí mít jeden zdroj.

---

## 3. Identifikátory

- Písmena včetně řeckých a diakritiky, číslice, `_`. Musí začínat písmenem.
- `_` zahajuje dolní index: `M_Ed` → M<sub>Ed</sub>, `T_1` → T<sub>1</sub> (**převzato z Calcpadu**).
- Unicode a ASCII zápisy jsou rovnocenné a v tisku se zobrazí stejně:

| Unicode | ASCII |
|---|---|
| `σ`, `Δ`, `η` | `sigma`, `Delta`, `eta` |
| `·`, `×` | `*` |
| `÷` | `/` |
| `²`, `³`, `⁴` | `^2`, `^3`, `^4` |
| `≤`, `≥`, `≠` | `<=`, `>=`, `!=` |
| `√(x)` | `sqrt(x)` |
| `ṁ` | `m_dot` |

---

## 4. Čísla a jednotky

### 4.1 Zápis

```text
2.4 kg/s
4180 J/(kg·K)
1.5e-3 m
20 °C
21 %
```

- **V souboru** je desetinná **tečka** a čárka odděluje argumenty funkcí, aby list šel otevřít v libovolném jazyce.
- **Při psaní** se používá zápis jazyka programu (upraveno 2026-09-30 na přání uživatele). V češtině se píše `50,5` a argumenty se oddělují **středníkem** jako v českém Excelu: `max(1,5; 2)`. Editor řádek při úpravě převádí mezi oběma zápisy, texty v uvozovkách a komentáře nemění. Tečka napsaná ze zvyku (`50.5`) se přijme také. Čárka s mezerou (`max(1, 2)`) se bere jako oddělovač argumentů.
- Tisk používá formát čísel jazyka tisku (`50,5` v češtině).
- Jednotka **bezprostředně za číslem** je vždy jednotka (**převzato z Calcpadu**).

### 4.2 Jednotka, nebo proměnná?

Tohle je nejčastější zdroj chyb, proto pravidlo **přísnější než u konkurence**:

1. Za číslem (`5 m`) je to vždy jednotka. Jednotka za číslem pokračuje přes `/`, `·` a mocniny, dokud následují jednotky (`12 kN/m`, `4180 J/(kg·K)`). `5 m / 2 s` je proto (5 m)/(2 s).
2. Samostatně stojící název:
   - je-li definovaný jako proměnná, je to proměnná,
   - jinak je to jednotka.
3. **Pokud je jméno za číslem zároveň definovaná proměnná** (`L := 5 m`, pak `V := 2 L`: litr, nebo L?), program ho čte jako jednotku a vydá **varování** `W-AMBIGUOUS-UNIT` přímo v místě použití. (*Calcpad to tiše přijme. U nás platí princip „nehádat potichu“.*)
   *Upraveno při implementaci F1:* původně navržené varování už při definici (`L := 5 m`) by se objevovalo pořád, protože běžná inženýrská jména (L, A, F, T, V, h, d, t, m) jsou zároveň jednotky. Varuje se proto jen tam, kde nejednoznačnost opravdu vznikne.
4. Vynucení jednotky: `[m]` v hranatých závorkách (**inspirace EPX**, který jednotky vždy píše do hranatých závorek). Ekvivalent Calcpadové tečky `.m`, ale čitelnější.

### 4.3 Vnitřní reprezentace

- Hodnota je uložena **v základních jednotkách SI** a k ní vektor exponentů dimenzí (**převzato z postgresql-unit a Calcpadu**).
- Jednotka zobrazení se určí takto: (1) cílová jednotka `| …`, (2) jednotka z nastavení listu pro danou dimenzi, (3) jednotka odvozená ze zápisu vstupu.

### 4.4 Teplota

Nejčastější past jednotkových systémů. Pravidla (**převzato z Calcpadu + EPX**):

- `°C`, `°F` jsou **absolutní teploty** s posunem nuly.
- `Δ°C`, `Δ°F` (ASCII `delta_degC`) jsou **teplotní rozdíly** bez posunu. `1 Δ°C = 1 K`.
- `T₂ - T₁` dvou absolutních teplot dává **rozdíl** (v K, zobrazitelný v `Δ°C`).
- Sčítání dvou absolutních teplot je **chyba** s vysvětlením.
- Násobení absolutní teploty (např. `p·V = n·R·T` s `T := 20 °C`) je fyzikálně správné, počítá se v kelvinech. Program ale vydá **varování**, protože častěji jde o záměnu s rozdílem. (*Upraveno při implementaci F1, původně navrženo jako chyba.*)
- `4180 J/(kg·K)` · `60 K` funguje. `4180 J/(kg·°C)` se v jednotce interpretuje jako rozdíl, tedy `J/(kg·Δ°C)`.

### 4.5 Bezrozměrné a zvláštní dimenze

- `%`, `‰`, `ppm` jsou bezrozměrné násobitele (`21 % = 0.21`).
- **Úhel je bezrozměrný** podle SI (`rad = 1`, `° = π/180`). `sin(30°)` funguje, `sin(30)` je v radiánech.
  *Upraveno při implementaci F1:* Calcpad dává úhlu vlastní dimenzi, aby se nemíchal s procenty. To ale rozbije běžné vzorce jako `v = ω·r` (vyšlo by m·rad/s místo m/s). Záměna úhlu s procentem je vzácnější než tyto vzorce.
- **Vlastní základní dimenze** (kap. 4.6).

### 4.6 Vlastní dimenze a jednotky

```text
dimension Mena                   ' nová základní dimenze
unit CZK: Mena                   ' základní jednotka dimenze
unit EUR := kurz(Kurzy, "EUR", 2026-09-29) CZK     ' převod z tabulky k datu
unit ks: dimensionless           ' počitatelné kusy
unit kNm := kN·m                 ' odvozená jednotka (alias)
```

*Upřesněno při implementaci F8:*
- `dimension`, `unit … : …` a `unit … := …` platí od svého řádku dolů (jednotku nejde použít nad ním) a jen v tomto listu.
- Základní jednotka pojmenuje výsledky bez jednotky: `1000 CZK / 4 os` se ukáže jako „250 CZK/os“, ne „Mena/Osoby“.
- `unit ks: dimensionless` (nebo `unit ks: 1`) je počitatelná jednotka bez dimenze. Výsledek si ji ponese (`12 ks · 2 = 24 ks`).
- Jednotka daná hodnotou smí číst hodnoty shora: `unit EUR := kurz·CZK`. V tisku je vidět jako předpoklad „1 EUR = 25 CZK“, deklarace dimenzí a základních jednotek se netisknou.
- Změna kterékoli vlastní jednotky přepočte celý list.
- Chyby: neznámá dimenze (E-UNDEFINED), jméno už použité pro jednotku nebo základní dimenzi SI (E-REDEFINED).
- Kurz k datu z tabulky (`kurz(Kurzy, "EUR", 2026-09-29)`) přijde s daty v F10.

*Oproti Calcpadu:* tam jsou všechny vlastní bezrozměrné jednotky v jedné společné „deváté dimenzi“, takže nejde odlišit měny od bitů. U nás má každá vlastní dimenze vlastní exponent. Převod měn je vázaný na **datum a zdroj**, a je tedy dohledatelný.

### 4.7 Jednotky mol konkrétní látky (chemie, R3)

Mol je v jádru obyčejný mol. Rozlišení „mol NaCl vs. mol H₂O“ se neřeší dimenzí, ale **tabulkou látek** (molární hmotnost jako sloupec). Jádro tím zůstane oborově neutrální.

---

## 5. Operátory a priority

Od nejvyšší priority (**převzato z Calcpadu, standardní školní matematika**):

| Priorita | Operátory | Asociativita |
|---|---|---|
| 1 | `( )`, volání funkce, `.` (přístup ke sloupci/členu), indexace `[ ]` | — |
| 2 | `^` (mocnina) | **zprava** (`2^3^2 = 2^9`) |
| 3 | unární `-`, `+` | — |
| 4 | implicitní násobení číslo·jednotka (`5 m`) | — |
| 5 | `*`, `·`, `/`, `÷` | zleva |
| 6 | `+`, `-` | zleva |
| 7 | `<`, `≤`, `>`, `≥`, `==`, `≠` | — |
| 8 | `not` | — |
| 9 | `and`, `or` | zleva |
| 10 | `\|` cílová jednotka (vždy na konci výrazu) | — |

**Implicitní násobení** mezi dvěma proměnnými (`a b`) **není povoleno**. Je to chyba s nápovědou „chybí `·`?“.
*Proč:* zápis `ab` by mohl být jedna proměnná `ab`, nebo `a·b`. Povoluje se jen číslo·jednotka (`5 m`), číslo·závorka (`2(a+b)`) a závorka·jednotka (`(3 + 4j) Ω`, *doplněno v F9*; jméno definované výše zůstává jménem, ne jednotkou).

---

## 6. Typy hodnot

| Typ | Příklad | Fáze |
|---|---|---|
| Veličina (číslo s jednotkou) | `5 m`, `0.21` | F1 |
| Logická hodnota | `true`, výsledek `≤` | F1 |
| Text | `"S235"` | F2 |
| Řádek tabulky | `pick(Profily, "IPE 200")` | F2 |
| Tabulka | `Profily_IPE` | F2 |
| Komplexní číslo | `(3 + 4j) Ω`, `4i` | F9 ✓ |
| Řada / vektor | `[100; 120; 150] CZK`, `range(1, 25)` | F10 ✓ |
| Datum a období | `2026-09-29`, `25 yr` | F10 ✓ |

---

## 7. Funkce

### 7.1 Vestavěné (F1)

`sqrt`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `ln`, `log10`, `min`, `max`, `round`, `floor`, `ceil`, `if(podmínka, a, b)`.

Goniometrické a logaritmické funkce **vyžadují bezrozměrný argument** (nebo úhel). Jinak je to chyba (**stejně jako Calcpad**).

### 7.1a Komplexní čísla (F9)

```text
Z := (3 + 4j) Ω                 ' j nebo i hned za číslem, bez mezery
I := 230 V / Z                  ' (27,6 − 36,8j) A
abs(I) =                        ' 46 A
arg(Z) | ° =                    ' 53,13°
U := polar(230 V, 30°)          ' zadání v polárním tvaru
S := U·conj(I) | VA             ' zdánlivý výkon
```

- Funkce: `re`, `im`, `conj`, `abs` (velikost), `arg` (úhel), `polar(r, φ)`, `sqrt`. Mocnina jen s reálným exponentem.
- Výsledky se píší s `j`: „(27,6 − 36,8j) A“.
- Komplexní čísla nemají pořadí: `<`, `≤` i posudek s nimi je chyba s radou porovnat `abs(…)` (E-COMPLEX-ORDER). Kde dávají smysl jen reálná čísla (goniometrické funkce, tabulky, řešič, absolutní teplota), je chyba E-COMPLEX-ARG, nikdy tiché zahození imaginární části.
- `sqrt(-4)` zůstává chybou; odmocnina z komplexního čísla dá hlavní hodnotu.
- Jména `i` a `j` zůstávají volná pro proměnné (`1000·(1 + i)`); imaginární jednotka je jen hned za číslem.

### 7.1b Řady, finance a data (F10)

```text
roky := range(1, 25)                         ' [1; 2; …; 25]
uspora := 43316 CZK·1.03^(roky - 1)          ' počítá se po prvcích
CF := [-258875 CZK, uspora]                  ' řada uvnitř řady se rozvine
CF[1] =                                      ' první prvek (počítá se od 1)
NPV := npv(4 %, CF)                          ' první tok je teď (t = 0)
IRR := irr(CF) | %
doba := payback(CF)                          ' roky, lineárně v roce návratu
splatka := pmt(5 %, 20, 1000000 CZK)         ' anuita
rok := sum(Vyroba.E)                         ' sloupec tabulky jako řada
```

- Řada má všechny prvky stejné dimenze. S číslem nebo stejně dlouhou řadou se počítá po prvcích (`+ − · / ^`). Řady se neporovnávají (`<` je chyba).
- Funkce: `range(od, do[, krok])`, `sum`, `mean`, `len`, `cumsum`, `min`/`max` přes řadu, `npv`, `irr`, `pmt`, `payback`.
- `[m]` zůstává jednotkou; řada je vše ostatní v hranatých závorkách a smí mít jednotku za sebou: `[1, 2] m`.
- V tisku se dlouhá řada zkrátí: „[1; 2; 3; 4; 5; …; 24; 25] (25)“.

**Data:** `2026-09-29` (bez mezer; s mezerami je to odčítání) je absolutní čas jako absolutní teplota:
`datum − datum` dá dny, `datum + 30 d` dá datum, `(d_2 − d_1) | yr` dá roky, dvě data sečíst ani násobit nejde.
Funkce `date(2026, 9, 29)`, `year`, `month`, `day`; jednotky `wk` a `yr` (365,25 d; ne `a`, to je příliš časté jméno).
Tabulky mají sloupce typu `date` (`2026-09-29` i `29.9.2026`); kurz k datu: `find_max(Kurzy, by: datum, where: r.datum ≤ d).EUR`.
Data se píší v jazyce tisku: „29. 9. 2026“.

### 7.2 Uživatelské funkce (F7)

```text
A_kruh(d) := π·d²/4
A := A_kruh(20 mm)          ' 314,2 mm²
σ(M, W) := M/W              ' česky: σ(M; W) := M/W
```

*Upřesněno při implementaci F7:*
- Funkce je hodnota listu. Při definici si zapamatuje hodnoty, které její tělo čte shora (např. `E`). Platí tak pravidlo „shora dolů“: funkce vidí jen to, co je nad ní, a nesmí volat sama sebe (chyba E-RECURSION).
- Když se změní hodnota, kterou funkce čte, nebo její tělo, přepočte se funkce i všechna volání.
- Parametry jsou v těle funkce jména, i když se píší jako jednotka (`m`, `t`, `s`, `d`). Mimo funkci je `m` zase metr.
- Jednotky se kontrolují až při volání: `A_kruh(20 mm)` dá mm², sečtení metrů a sekund v těle je chyba u volání.
- Funkci jde předat jako argument: `pouzij(g, x) := g(x)`.
- Jména vestavěných funkcí (`sqrt`, `pick`, …) jsou vyhrazená (E-RESERVED).
- V editoru napsané „=“ za hlavičkou nové funkce (`A_kruh(d) =`) se změní na „:=“.
- V tisku se definice ukáže jako vzorec bez dosazení a výsledku, hlavička česky s „;“: `σ(M; W)`.
- Celá mocnina zachová jednotku, se kterou hodnota přišla: `(20 mm)²` je 400 mm², ne 0,0004 m².

### 7.2a Znovupoužitelné bloky (F7)

Blok je hotový výpočet uložený v listu (`blocks/<Jméno>/`), například „prostý nosník“. Jeho vstupy se v textu bloku označí slovem `input`:

```text
# Prostý nosník                  ' text bloku
@version 1.2
input L := 5 m
input q := 12 kN/m
M_max := q·L²/8 | kN·m
```

V listu se blok volá jménem, vstupy se zadávají jménem a nezadané platí z bloku:

```text
N1 := Prosty_nosnik(L: 6 m; q: 10 kN/m)
M := N1.M_max                    ' 45 kN·m
```

- Výsledek volání nese všechny hodnoty bloku (`N1.M_max`, `N1.L`).
- Vstup musí mít stejný rozměr jako v bloku (E-BLOCK-INPUT). Neznámý vstup i nepojmenovaný argument je chyba.
- Blok smí použít jiný blok, ale ne sám sebe.
- Změna textu bloku nebo vstupu přepočte všechna místa, kde se blok volá.
- V tisku je u řádku odkaz „Výpočet bloku: Příloha C“. Každé použití bloku se vytiskne jako příloha s celým výpočtem pro zadané vstupy, aby kontrolor viděl, odkud výsledek je.
- V editoru: Vložit → Blok ze souboru… zkopíruje výpočet z jiného souboru do listu a vloží řádek s voláním a předvyplněnými vstupy. Bloky listu jsou vidět v panelu Vrstvy.

### 7.3 Podmíněná hodnota

```text
k := if(λ ≤ 0.2, 1.0, 0.8)
```

Plnohodnotné větvení a cykly (Calcpad `#if`, `#for`) **nejsou** v první verzi záměrně.
*Proč:* technický výpočet má být čitelný shora dolů. Složitější logika patří do tabulek, řešiče nebo zásuvných modulů.

---

## 8. Tabulky

### 8.1 Definice tabulky

Tabulky žijí v datové vrstvě listu (`tables/<Název>/schema.json` + `data.csv`). V textu výpočtu se na ně odkazuje jménem. Schéma:

```json
{
  "name": "Profily_IPE",
  "key": "oznaceni",
  "columns": [
    { "name": "oznaceni", "type": "text" },
    { "name": "h",  "type": "quantity", "unit": "mm" },
    { "name": "A",  "type": "quantity", "unit": "cm²" },
    { "name": "Iy", "type": "quantity", "unit": "cm⁴" },
    { "name": "Wy", "type": "quantity", "unit": "cm³" },
    { "name": "G",  "type": "quantity", "unit": "kg/m" }
  ],
  "image": "images/Profily_IPE/{oznaceni}.svg",
  "source": { "title": "Katalog výrobce XY", "retrieved": "2026-09-29" }
}
```

### 8.2 Práce s tabulkou

| Zápis | Význam | Fáze |
|---|---|---|
| `pick(T, "IPE 200")` | řádek podle klíčového sloupce. V editoru rozbalovací seznam s obrázkem. | F2 ✓ |
| `pick(T, G: 22.4 kg/m)` | řádek s přesnou hodnotou v libovolném sloupci | F2 ✓ |
| `profil.W_y` | hodnota sloupce, veličina s jednotkou ze schématu | F2 ✓ |
| `interpolate(T, λ: λ_rel)` | řádek **lineárně interpolovaný** podle sloupce λ (interpolují se všechny číselné sloupce); mimo rozsah extrapolace a varování | F2 ✓ |
| `interpolate(T, θ: 35 °C, n: 3)` | 2D (bilineární) interpolace v mřížce: tabulka má jeden řádek na bod (θ, n, k); chybí-li bod mřížky v okolí hodnoty, je to chyba | F9 ✓ |
| `find_min(T, by: G, where: …)` | řádek s nejmenším `G`, který splní podmínku | F2 ✓ |
| `find_max(T, by: …, where: …)` | obdobně | F2 ✓ |
| `filter(T, where: …)` | podmnožina řádků | F10 |

*Upraveno při implementaci F2:* původně navržené `lookup(T, x: λ, y: χ)` nebylo jednoznačné (kde je zadaná hodnota?). Nově `interpolate(T, λ: 0.4)` vrací celý interpolovaný řádek a hodnota se čte stejně jako u `pick`: `interpolate(Krivka, λ: 0.4).χ`. Přesný odečet bez interpolace je `pick(T, λ: 0.4)`.

Prázdné buňky: čtení prázdné buňky je chyba `E-TABLE-EMPTY`. V `find_min`/`find_max` se řádky, kterým pro podmínku chybí hodnota, přeskočí a program ohlásí jejich počet (`W-TABLE-ROWS-SKIPPED`).

**`where` podmínka** se vyhodnotí pro každý řádek. Uvnitř podmínky se `r` odkazuje na zkoušený řádek (případná proměnná `r` z listu je uvnitř podmínky zastíněná):

```text
profil := find_min(Profily_IPE, by: G,
                   where: q·L²/8 / r.Wy ≤ material.fy)
```

*Proč:* uživatel nemusí přepisovat výpočet do jiné formy. Podmínka je běžný výraz.

### 8.3 Import tabulek

- **CSV** (oddělovač `;`, `,` nebo tabulátor se pozná automaticky, desetinná čárka i tečka).
- **Excel (.xlsx)** včetně výsledků vzorců. **Obrázek vložený v Excelu nad řádkem záznamu se stane obrázkem tohoto záznamu** (uloží se do `images/<Tabulka>/` a propojí přes sloupec `obrazek`).
- Jednotky se čtou z hlavičky: `Wy [cm³]`, `h (mm)`, i `cm3` → `cm³`. Neznámá jednotka se ohlásí (`W-TABLE-UNIT`), nikdy se nehádá.
- Číselný sloupec = všechny neprázdné buňky jsou čísla; jinak textový.
- Uvnitř listu se tabulka ukládá jako `schema.json` + `data.csv` s desetinnou tečkou.

**Inspirace:** Calcpad UI mode (`#UI` rozbalovací výběry) ukazuje, že výběr ze seznamu má smysl přímo ve výpočtu. U nás je ale **zdrojem výběru tabulka v listu**, ne pevný seznam v kódu.

---

## 9. Řešič rovnic (F8)

```text
solve x:  x² + 2·x == 8          in 0 .. 10
solve (I_1, I_2):
    U_1 == R_1·I_1 + R_3·(I_1 - I_2)
    U_2 == R_2·I_2 + R_3·(I_2 - I_1)
    guess I_1 = 1 A, I_2 = 1 A
```

- Jedna neznámá s intervalem: **ohraničená metoda** (bisekce + Anderson–Björck, **převzato z Calcpadu `$Root`**). Spolehlivá, vždy najde kořen, pokud v intervalu je.
- Soustava: Newton-Raphson s numerickým Jakobiánem a počátečním odhadem `guess` (**inspirace EPX „system cell“ s guess hodnotami**, ale bez symbolického SymPy).
- Jednotky se hlídají i v řešiči.
- Nenalezené řešení je **chyba s vysvětlením**, ne tiché NaN.

*Upřesněno při implementaci F8:*
- Rovnice soustavy stojí na odsazených řádcích pod `solve` (v editoru Shift+Enter), nebo na jednom řádku oddělené čárkou (česky středníkem): `solve (x; y): x² + y² == 25; y == x + 1 guess x = 1; y = 1`.
- Neznámá dostane jednotku z intervalu (`in 0 s .. 10 s`) nebo z odhadu (`guess I_1 = 1 A`). Bez nich je bezrozměrná a začíná na 1.
- Neznámé jsou od řádku `solve` obyčejné hodnoty listu (i když se píší jako jednotka, např. `t`). Nad ním je použít nejde (E-DEFINED-LATER) a nesmí být definované dřív (E-REDEFINED).
- Když konce intervalu nemají opačné znaménko, řešič hledá změnu znaménka uvnitř intervalu (najde kořen nejblíž dolní mezi). Body, kde rovnice nemá hodnotu (dělení nulou, mimo definiční obor), přeskočí.
- Chyby: jiný počet rovnic než neznámých (E-SOLVE-COUNT), bez kořene v intervalu (E-SOLVE-NO-ROOT), Newton nekonverguje (E-SOLVE-NO-CONVERGENCE, zkuste jiný odhad), rovnice na sobě závisí (E-SOLVE-SINGULAR), strany rovnice s jinou jednotkou (E-UNIT-MISMATCH).
- V tisku jsou rovnice se znakem „=“, u jedné neznámé i interval („0 ≤ x ≤ 10“) a pod nimi nalezené hodnoty.
- Pozor na zápis `2 m/s²·t²`: za číslem vyhrávají jednotky, takže `t` je tu tuna. Správně je `(2 m/s²)·t²`.

---

## 10. Podmínky (posudky)

```text
check "Ohyb": σ ≤ material.fy        source "EN 1993-1-1, 6.2.5"
check "Rozpočet": N_celk ≤ 2_500_000 CZK   source "zadání investora"
```

- Výsledek: ✓ / ✗, **využití** = levá strana / pravá strana (u `≤`, `<`), případně obráceně (u `≥`, `>`).
- Využití se počítá jen pro jedno porovnání kladných hodnot. Podmínka typu `a and b` nebo s absolutními teplotami jen vyhoví / nevyhoví.
- Popisek (`"Ohyb":`) i `source` jsou volitelné. `check` a `source` jsou vyhrazená slova.
- Podmínka, kterou nešlo vyhodnotit (chyba ve vstupech), se v souhrnu vede jako **nevyhodnocená a nevyhovující**, aby nemohla zapadnout.
- **Dohledání původu** (`calccanvas trace list.cc σ`): strom vzorců a vstupů až k řádkům tabulek a jejich zdrojům. Řádky, které `find_min` jen zkoušel, se za zdroj nepovažují, jen vybraný řádek.
- `source` je volitelný text nebo odkaz do tabulky zdrojů listu.
- Program z podmínek sestaví souhrnnou tabulku (viz filozofie, kap. 6.1).
- Nesplněná podmínka **není chyba výpočtu**. Výpočet proběhne a v tisku je výrazně označená.

---

## 11. Řízení tisku

Řídí to hlavně nastavení tiskové vrstvy (`layout.json`), ale jednotlivé řádky jde upravit přímo v textu (**inspirace Calcpad `#nosub`, `#hide`, `#Round`**):

| Zápis | Význam |
|---|---|
| `@sub` / `@nosub` | vzorec s dosazením / bez dosazení |
| `@result` | jen výsledek (`a = 5 m`) |
| `@hide` | spočítat, ale netisknout (pomocné výpočty) |
| `@digits 3` | počet platných číslic |
| `@page` | zalomení stránky |

Výchozí zobrazení pro tisk je **vzorec → dosazení → výsledek** (standard technických výpočtů, převzato z Calcpadu i UzonCalc). Pomocné výpočty jde přesunout do pracovní vrstvy, a pak se netisknou vůbec.

---

## 12. Chyby a varování

Každá diagnostika má: **kód**, **závažnost** (chyba / varování / info), **místo** (řádek, sloupec, rozsah), **parametry** a volitelně **nápovědu**.

**Jádro nevrací text zprávy, jen kód a parametry.** Text vzniká až v UI podle jazyka, který si uživatel zvolil v nastavení (viz kap. 15).

| Kód | Příklad |
|---|---|
| `E-UNIT-MISMATCH` | `5 m + 2 s` — nelze sčítat délku a čas |
| `E-UNDEFINED` | proměnná použitá před definicí |
| `E-REDEFINED` | druhá definice téhož jména |
| `E-CYCLE` | cyklická závislost (s výpisem cesty) |
| `E-ABS-TEMP` | sčítání absolutních teplot |
| `E-TABLE-KEY` | `pick` nenašel klíč |
| `E-TABLE-EMPTY` | chybějící hodnota v tabulce |
| `E-SOLVE` | řešič nenašel řešení |
| `W-EXTRAPOLATION` | `lookup` mimo rozsah tabulky |
| `W-AMBIGUOUS-UNIT` | jméno za číslem je jednotka i proměnná |
| `W-ABS-TEMP-MUL` | absolutní teplota v součinu |
| `W-IMPLICIT-MUL` | podezřelé implicitní násobení |

Program **pokračuje ve výpočtu** i po chybě tam, kde to jde (nezávislé části listu se spočítají), a chyba se zobrazí v místě vzniku.

---

## 13. Co jsme z konkurence záměrně nepřevzali

| Co | Kde | Proč ne |
|---|---|---|
| Zápis v LaTeXu | EPX | Pro uživatele těžké, nečitelné v textovém souboru |
| Nativní Python jako jazyk výpočtu | UzonCalc | Uživatel má psát jako inženýr, ne jako programátor |
| Přepisování proměnných | Calcpad | Rozbíjí dohledatelnost |
| `#if`, `#for`, `#while` v textu výpočtu | Calcpad | Snižuje čitelnost. Patří do řešiče, tabulek, zásuvných modulů. |
| Symbolické výpočty (SymPy) | EPX | Těžké (Pyodide ~ desítky MB). Není pro MVP potřeba. |
| Jedna společná dimenze pro všechny vlastní jednotky | Calcpad | Nerozliší měnu od bitů |

---

## 14. Otevřené otázky jazyka

1. Víceřádkové výrazy: pokračování řádku `_` (Calcpad), nebo automaticky při neuzavřené závorce? Návrh: obojí.
2. Oddělovač tisíců v zápisu (`2 500 000`): povolit mezeru? Kolidovalo by to s implicitním násobením číslo·číslo. Návrh: povolit jen úzkou mezeru, nebo `_` (`2_500_000`).

---

## 15. Jazyk programu a lokalizace

**Rozhodnuto 2026-09-29.**

- **Soubor listu je jazykově neutrální.** Klíčová slova (`check`, `source`, `solve`, `pick` …) a názvy vestavěných funkcí jsou **anglicky**. List vytvořený v češtině jde otevřít v libovolném jiném jazyce.
- **Uživatel si v nastavení zvolí jazyk programu** (libovolný jazyk, pro který existuje překlad). Podle něj se překládá:
  - celé UI (menu, dialogy, nápověda),
  - hlášení chyb a varování (jádro vrací jen kód + parametry, viz kap. 12),
  - tisková vrstva: popisky jako „Posouzení“, „využití“, „Zdroj“, souhrn podmínek,
  - formát čísel a dat (desetinná čárka/tečka, oddělovač tisíců) podle zvyklostí jazyka, pokud ho list nepřepíše.
- **Jazyk tisku je vlastnost listu**, ne programu. Kolega v Německu otevře český výpočet v německém UI, ale tisk zůstane česky, dokud ho sám nezmění.
- **Co se nepřekládá:** jména proměnných, názvy tabulek a sloupců, texty a komentáře napsané uživatelem, značky jednotek (SI je mezinárodní).
- **Editor může klíčová slova zobrazovat přeložená** (např. `check` jako „posudek“), v souboru ale zůstává anglický tvar.
- Kód programu včetně komentářů je v angličtině.
- Překlady jsou v samostatných katalozích zpráv (`i18n/<jazyk>.json`). Začneme češtinou a angličtinou, další jazyk je jen další katalog bez změny kódu.
