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
| Definice | `a := 5 m` | Jako Mathcad. Odlišuje definici od rovnice. |
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

- Desetinná **tečka**. Čárka odděluje argumenty funkcí.
  *Proč:* česká desetinná čárka by kolidovala s oddělovačem argumentů. Zobrazení v tisku může desetinnou čárku použít (nastavení listu).
- Jednotka **bezprostředně za číslem** je vždy jednotka (**převzato z Calcpadu**).

### 4.2 Jednotka, nebo proměnná?

Tohle je nejčastější zdroj chyb, proto pravidlo **přísnější než u konkurence**:

1. Za číslem (`5 m`) je to vždy jednotka.
2. Samostatně stojící název:
   - je-li definovaný jako proměnná, je to proměnná,
   - jinak je to jednotka.
3. **Pokud se jméno proměnné shoduje s jednotkou** (`m := 20 kg` — „m“ je i metr), program vydá **varování** v místě definice. (*Calcpad to tiše přijme. U nás platí princip „nehádat potichu“.*)
4. Vynucení jednotky: `[m]` v hranatých závorkách (**inspirace EPX**, který jednotky vždy píše do hranatých závorek). Ekvivalent Calcpadové tečky `.m`, ale čitelnější.

### 4.3 Vnitřní reprezentace

- Hodnota je uložena **v základních jednotkách SI** a k ní vektor exponentů dimenzí (**převzato z postgresql-unit a Calcpadu**).
- Jednotka zobrazení se určí takto: (1) cílová jednotka `| …`, (2) jednotka z nastavení listu pro danou dimenzi, (3) jednotka odvozená ze zápisu vstupu.

### 4.4 Teplota

Nejčastější past jednotkových systémů. Pravidla (**převzato z Calcpadu + EPX**):

- `°C`, `°F` jsou **absolutní teploty** s posunem nuly.
- `Δ°C`, `Δ°F` (ASCII `delta_degC`) jsou **teplotní rozdíly** bez posunu. `1 Δ°C = 1 K`.
- `T₂ - T₁` dvou absolutních teplot dává **rozdíl** (v K, zobrazitelný v `Δ°C`).
- Sčítání dvou absolutních teplot, nebo násobení absolutní teploty ve °C je **chyba** s vysvětlením.
- `4180 J/(kg·K)` · `60 K` funguje. `4180 J/(kg·°C)` se v jednotce interpretuje jako rozdíl, tedy `J/(kg·Δ°C)`.

### 4.5 Bezrozměrné a zvláštní dimenze

- `%`, `‰`, `ppm` jsou bezrozměrné násobitele (`21 % = 0.21`).
- **Úhel** má vlastní nefyzikální dimenzi, aby se nemíchal s procenty (**převzato z Calcpadu**). `sin(30°)` funguje, `sin(30)` je v radiánech.
- **Vlastní základní dimenze** (kap. 4.6).

### 4.6 Vlastní dimenze a jednotky

```text
dimension Mena                   ' nová základní dimenze
unit CZK: Mena                   ' základní jednotka dimenze
unit EUR := kurz(Kurzy, "EUR", 2026-09-29) CZK     ' převod z tabulky k datu
unit ks: dimensionless           ' počitatelné kusy
unit kNm := kN·m                 ' odvozená jednotka (alias)
```

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
*Proč:* zápis `ab` by mohl být jedna proměnná `ab`, nebo `a·b`. Povoluje se jen číslo·jednotka (`5 m`) a číslo·závorka (`2(a+b)`).

---

## 6. Typy hodnot

| Typ | Příklad | Fáze |
|---|---|---|
| Veličina (číslo s jednotkou) | `5 m`, `0.21` | F1 |
| Logická hodnota | `true`, výsledek `≤` | F1 |
| Text | `"S235"` | F2 |
| Řádek tabulky | `pick(Profily, "IPE 200")` | F2 |
| Tabulka | `Profily_IPE` | F2 |
| Komplexní číslo | `3 + 4i Ω` | F9 |
| Řada / vektor | `[100; 120; 150] CZK`, `range(1, 25)` | F10 |
| Datum a období | `2026-09-29`, `25 roků` | F10 |

---

## 7. Funkce

### 7.1 Vestavěné (F1)

`sqrt`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `ln`, `log10`, `min`, `max`, `round`, `floor`, `ceil`, `if(podmínka, a, b)`.

Goniometrické a logaritmické funkce **vyžadují bezrozměrný argument** (nebo úhel). Jinak je to chyba (**stejně jako Calcpad**).

### 7.2 Uživatelské funkce (F7)

```text
A_kruh(d) := π·d²/4
A := A_kruh(20 mm)
```

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
| `pick(T, "IPE 200")` | řádek podle klíče. V editoru rozbalovací seznam s obrázkem. | F2 |
| `r.Wy` | hodnota sloupce, veličina s jednotkou | F2 |
| `lookup(T, x: λ, y: χ)` | odečet `y` pro dané `x`, **lineární interpolace**. Mimo rozsah = varování. | F2 |
| `lookup(T, x: λ, y: χ, mode: exact)` | bez interpolace, chyba, když přesná hodnota chybí | F2 |
| `lookup2(T, řádek: a, sloupec: b)` | 2D interpolace (tabulky součinitelů) | F9 |
| `find_min(T, by: G, where: …)` | řádek s nejmenším `G`, který splní podmínku | F2 |
| `find_max(T, by: …, where: …)` | obdobně | F2 |
| `filter(T, where: …)` | podmnožina řádků | F10 |

**`where` podmínka** se vyhodnotí pro každý řádek. Uvnitř podmínky se `r` odkazuje na zkoušený řádek:

```text
profil := find_min(Profily_IPE, by: G,
                   where: q·L²/8 / r.Wy ≤ material.fy)
```

*Proč:* uživatel nemusí přepisovat výpočet do jiné formy. Podmínka je běžný výraz.

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

---

## 10. Podmínky (posudky)

```text
check "Ohyb": σ ≤ material.fy        source "EN 1993-1-1, 6.2.5"
check "Rozpočet": N_celk ≤ 2_500_000 CZK   source "zadání investora"
```

- Výsledek: ✓ / ✗, **využití** = levá strana / pravá strana (u `≤`), případně obráceně (u `≥`).
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

Každá diagnostika má: **kód**, **závažnost** (chyba / varování / info), **místo** (řádek, sloupec, rozsah), **zprávu česky** a volitelně **nápovědu**.

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
| `W-NAME-IS-UNIT` | jméno proměnné se shoduje s jednotkou |
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

1. Klíčová slova česky, nebo anglicky? (`check` / `posudek`). Návrh: anglická v souboru, v editoru a tisku podle jazyka listu.
2. Víceřádkové výrazy: pokračování řádku `_` (Calcpad), nebo automaticky při neuzavřené závorce? Návrh: obojí.
3. Oddělovač tisíců v zápisu (`2 500 000`): povolit mezeru? Kolidovalo by to s implicitním násobením číslo·číslo. Návrh: povolit jen úzkou mezeru, nebo `_` (`2_500_000`).
