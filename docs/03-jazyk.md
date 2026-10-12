# Kalketa — Jazyk výpočtu

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
| Volný text | řádek bez výrazu v uvozovkách `"…"`, nebo blok `text: …`; za textem smí stát odkazy na zdroj `"…" [T1]`, `[ST:T1]` (2026-10-06) | v tisku odstavec, odkaz šedě za ním; jména s indexem a mocniny v textu (`σ_Kt`, `mm^2`) se vysází jako ve vzorci (2026-10-08); vektor `p⃗_1` (kombinující šipka U+20D7 za písmenem, tlačítko na liště Operátory) má šipku nad písmenem i indexem |
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

### 4.2a Jednotka výsledku součinu a podílu

*Upřesněno 2026-10-01:* jednotky činitelů se **skládají**: `q·L²/8` z kN/m a m dá **kN·m**, `M/L` dá kN, `1000 kWh · 4,2 Kč/kWh` dá Kč. Stejné jednotky se krátí. Výjimky, kdy se výsledek ukáže v SI: složená jednotka, pro kterou existuje vlastní název (MPa·mm² → N, kg·m/s² → N), dvě jednotky stejného rozměru (mm²·m → m³) a víc než tři různé jednotky. **Joule se sám nevolí**, protože stejný rozměr má moment (kN·m); energii ukáže cílová jednotka (`| kWh`, `| J`).

*Upřesněno 2026-10-06 (měřítko výpočtu):* výsledek zůstane v měřítku, ve kterém se počítá; metry se neobjeví tam, kde se počítalo v mm.
- **Vlastní název s předponou téže velikosti:** N·mm/mm³ → **MPa**, N/mm² → MPa (i 0,8 MPa), kN/m² → **kPa**, MPa·mm² → N, kN·m/s → **kW**. Joule dál ne: moment je kN·m.
- **Mocnina délky:** podíl či součin různých druhů, který je plochou nebo objemem, dostane mm², cm³…: `F/τ` z N a MPa → **mm²** (ne N/MPa).
- **Odmocnina** zachová jednotku: √mm² → mm, ∛cm³ → cm, √(m²/s²) → m/s; platí pro `√`, `sqrt`, `cbrt`, `^0.5` i `^(1/3)`. `√(4·S/π)` s S v mm² → **mm**, `sqrt(a² + b²)` s a, b v mm → mm.
- **Smíšené jednotky jednoho druhu** (m a cm v kN·m/cm³): předpona, ve které je hodnota aspoň 1: 193 MPa, ne 0,193 GPa. mm²·m dál v SI (m³).

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

*Doplněno po F10:* **měny jsou vestavěné**, každá má vlastní dimenzi: CZK (i „Kč“), EUR („€“), USD („$“), GBP („£“), CHF, PLN („zł“), HUF („Ft“), JPY („¥“). `5 CZK + 2 EUR` je chyba, dokud list neurčí kurz (`unit EUR := 24,7 CZK` nebo kurzem z tabulky k datu); vestavěnou měnu jde takto v listu předefinovat. Listy, které si měnu deklarovaly samy (`dimension Mena`, `unit CZK: Mena`), fungují dál. Výkon panelů: `kWp`.

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

Funkce jsou v **registru funkcí** rozdělené do modulů. Každá funkce má v registru název, modul, parametry, počet argumentů a výpočet. Jádro se na funkci jen ptá registru, takže přidat modul (obor, později zásuvný modul) nevyžaduje zásah do jádra. Z registru vzniká i nápověda **Nápověda → Funkce (F1)**: hledání, popis v jazyce programu, kliknutím se funkce vloží na místo kurzoru.

| Modul | Funkce |
|---|---|
| Matematika | `sqrt` (také `√x`), `cbrt` (také `∛x`, ze záporného čísla záporná), `root(x, n)` (n-tá odmocnina), `abs`, `min`, `max`, `hypot(a, b, …)`, `mod(a, b)`, `sign`, `floor`, `ceil`, `round(x)` / `round(x, n)`, `exp`, `ln`, `log10`, `log(x, b)`, `factorial(n)` |
| Goniometrické a hyperbolické | `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2(y, x)`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` |
| Komplexní čísla | `re`, `im`, `conj`, `arg`, `polar(r, φ)` (7.1a) |
| Řady | `range`, `sum`, `len`, `cumsum` (7.1b) |
| Statistika | `mean`, `median`, `stdev` (výběrová, n − 1) |
| Finance | `npv`, `irr`, `pmt`, `payback` (7.1b) |
| Data | `date`, `year`, `month`, `day` (7.1b) |
| Logika | `if(podmínka, a, b)` (7.3) |
| Tabulky | `pick`, `interpolate`, `find_min`, `find_max` (kap. 8) |
| Grafy | `plot` (7.1e) |

**Lišta Funkce** (nahoře, jako palety Mathcadu) vloží zápis funkce s kurzorem tam, kde se pokračuje: ∫ `integral(‸; x: 0 .. 1)`, d/dx, ∑, matice 2×2, |x|, if, řešič (nový řádek `solve`), graf a nápověda F1. Meze a proměnnou stačí přepsat; lištu jde jako ostatní přesunout, skrýt nebo upravit (Nástroje → Přizpůsobit).

Počet argumentů kontroluje registr jednotně (`E-FUNC-ARITY`). `mod` a `hypot` zachovají jednotku (`mod(1250 mm, 1 m) = 250 mm`), `median` a `stdev` jednotku řady.

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

### 7.1c Integrály, derivace a součty

```text
F := integral(q·x·(L − x)/2, x: 0 m .. L)       ' ∫₀ᴸ … dx
φ := derivative(w(x), x: L/2)                    ' d/dx w(x) v bodě x = L/2
κ := derivative(w(x), x: L/2, order: 2)          ' druhá derivace
S := sum(1/k², k: 1 .. 100)                      ' Σ přes k
```

- **Proměnná je vlastní** (jako v Calcpadu): `x` uvnitř volání nečte ani nemění `x` listu. Jméno proměnné se pozná, i když zní jako jednotka: v `integral(3·t², t: 0 s .. 2 s)` je `t` čas, ne tuna.
- **Jednotky** (jako v EngineeringPaper.xyz): integrál má jednotku integrandu krát proměnnou (`∫ q dx` z kN/m a m dá kN), derivace jednotku výrazu lomeno proměnnou (mm/m, u druhé mm/m²). Meze integrálu musí mít stejný rozměr.
- **Integrál:** adaptivní Gauss–Kronrod 7–15 (jako `$Area` v Calcpadu), relativní přesnost 10⁻¹⁰. Zvládá i slabé singularity v krajích (∫₀¹ 1/√x dx = 2). Když přesnosti nedosáhne (nespojitost, singularita), dá odhad s varováním `W-CALCULUS-ACCURACY`. Opačné meze dají opačné znaménko.
- **Derivace:** centrální diference s Riddersovou (Richardsonovou) extrapolací (jako `$Slope` v Calcpadu), řád 1 nebo 2 (`order: 2`). Funkce musí být v okolí bodu spojitá a hladká.
- **Součet** `sum(f(k), k: a .. b)` přes celá čísla; `sum(řada)` zůstává.
- **Tisk:** ∫ s mezemi a dx, d/dx s bodem (|ₓ₌ₐ), Σ s indexem. V řádku dosazení se dosadí hodnoty (meze, q, L…), proměnná zůstane symbolem.
- Chyby: chybí proměnná nebo rozsah (`E-CALCULUS-FORM`), rozsah `a .. b` mimo proměnnou (`E-RANGE-PLACE`), meze s různou jednotkou (`E-UNIT-MISMATCH`), řád derivace jiný než 1 nebo 2 (`E-DOMAIN`).

**Kořeny a extrémy (2026-10-05):**

```text
r := roots(x^3 - 6·x^2 + 11·x - 6, x)           ' [1; 2; 3]
ω := roots(k - m·ω_0^2, ω_0)                     ' [−10; 10] Hz, jednotka z koeficientů
x_max := maximize(M(x), x: 0 m .. L)             ' kde je M největší: 2,5 m
M_max := M(x_max)
```

- **`roots(p, x)`** dá všechny kořeny mnohočlenu v `x` (nejvýš 20. stupně) jako řadu, i komplexní (`[1; 2j; −2j]`), reálné napřed a vzestupně. Koeficienty program najde z výrazu sám, jednotku `x` z nich (všechny členy musí mít stejný rozměr). Výpočet: Durand–Kernerova iterace a zpřesnění Newtonem. Co není mnohočlen, je chyba `E-ROOTS-POLYNOMIAL`.
- **`minimize(f(x), x: a .. b)`** a **`maximize`** dají místo v intervalu, kde je `f` nejmenší (největší), s jednotkou intervalu; hodnota je pak `f(x_min)`. Hledá se celý interval (400 bodů, pak zlatý řez kolem nejlepšího), takže se najde globální extrém v intervalu, ne nejbližší lokální. V tisku arg min / arg max s intervalem pod ním.

### 7.1d Matice a vektory

```text
K := [12 kN/m, 6 kN | 6 kN, 4 kN·m]      ' řádky oddělené |, prvky čárkou (česky středníkem)
F := [1 kN | 0 kN·m]                      ' sloupec: prvky s různými jednotkami
x := lsolve(K, F)                          ' x = [u; φ] = [0,3333 m; −0,5]
A := [4, -2 | -2, 4] kN/m                  ' jednotka za závorkou platí pro všechny prvky
A[1, 2]                                    ' prvek: řádek, sloupec (od 1)
ω² := eigenvals(K_s, M_s)                  ' vlastní kmitání: K·φ = ω²·M·φ
```

- **Zápis** jako v Calcpadu: řádky oddělené `|`. Matice s jedním řádkem je obyčejná řada `[a, b, c]`. **Jednotky po prvcích** (jako v EngineeringPaper.xyz): matice tuhosti může mít kN/m, kN i kN·m; jednotka za závorkou platí pro všechny prvky; `| kN` převede všechny prvky.
- **Operace:** `+` a `−` po prvcích (stejné rozměry), `·` a `/` číslem po prvcích, `A·B` a `A·v` jako maticový součin (jednotky v každém součtu musí souhlasit), `v·A` bere řadu jako řádek, `A^n`, `A^-1`. Řada se řadou se dál násobí po prvcích (peněžní toky); skalární součin je `dot(a, b)`.
- **Funkce** (modul „Matice a vektory“ v nápovědě F1): `transpose`, `det`, `inverse`, `lsolve(A, b)` (LU rozklad s výběrem hlavního prvku, `b` může být i matice), `identity(n)`, `rows`, `cols`, `row(A, i)`, `col(A, j)`, `diag`, `trace`, `dot`, `cross`, `norm`, `eigenvals(A)` / `eigenvals(K, M)` (Jacobiho rotace, zobecněná úloha přes Choleského rozklad M), `eigenvecs` (sloupce, největší prvek 1).
- **Jednotky výsledků:** `det`, `inverse` a `lsolve` potřebují matici, jejíž jednotky mají tvar *jednotka řádku × jednotka sloupce* (matice tuhosti ho má). Z ní plynou jednotky výsledku: řešení K·x = F má u posunu m a u pootočení žádnou jednotku. Vlastní čísla potřebují jednu jednotku pro celou matici; `eigenvals(K, M)` z N/m a kg dá 1/s² (ω²).
- **Řada má jeden rozměr** (kvůli financím a součtům); vektor s různými jednotkami se píše jako sloupec `[1 kN | 0 kN·m]`. Výsledek s různými jednotkami (řešení soustavy) se v tisku ukáže s jednotkou u každého prvku.
- **Tisk:** matice jako tabulka v hranatých závorkách, společná jednotka za závorkou; zapsaná matice (jen čísla) se ukáže jednou, jako zadaná hodnota.
- Chyby: nesouhlasí rozměry (`E-MATRIX-SHAPE`), není čtvercová (`E-MATRIX-SQUARE`), jednotky nemají tvar řádek × sloupec (`E-MATRIX-UNITS`), singulární matice (`E-MATRIX-SINGULAR`), vlastní čísla nesymetrické matice (`E-MATRIX-SYMMETRIC`).

### 7.1e Grafy

```text
M(x) := q·x·(L − x)/2
plot(M(x), x: 0 m .. L) | kN·m                     ' průběh funkce, jednotka osy y
plot(M(x), M_pl(x), x: 0 m .. L, title: "Momenty") ' více křivek na jedné ose, s popisem „Obr. n“
plot(v, x: t, kind: "points")                       ' naměřená data: y pro každý prvek řady x
plot(Vyroba.E, x: Vyroba.datum, kind: "bar")        ' sloupce tabulky, osa x s daty
plot(CF, kind: "bar", title: "Peněžní toky")        ' řada proti pořadí 1, 2, 3, …
```

- **Graf je samostatný řádek** `plot(…)` (jako v Mathcadu a SMath oblast grafu, zápisem blíž Calcpadu `$Plot`). Přepočítá se s výpočtem; do proměnné ani do výrazu ho přiřadit nejde (`E-PLOT-PLACE`).
- **Proměnná je vlastní** jako u integrálu: `x` v `plot(M(x), x: 0 m .. L)` nečte `x` listu, a jméno se pozná, i když zní jako jednotka (`t`).
- **Rozsah** `x: a .. b` se rozdělí na 201 bodů (u `points` a `bar` na 11); jinak `samples: n` (2 až 2001). **Řada** `x: t` dá body v jejích prvcích; výraz, který na `x` nezávisí a je řadou stejné délky (sloupec tabulky), dá své prvky v pořadí. Bez proměnné je osa x pořadí prvků.
- **Jednotky:** osa x má jednotku rozsahu (`0 mm .. 5000 mm` → mm), osa y jednotku za `|`, jinak jednotku první hodnoty. **Graf má jednu osu y:** křivky různých rozměrů jsou chyba (`E-PLOT-UNITS`) s radou nakreslit dva grafy (dvě osy y svádějí ke klamnému čtení). Data na ose x se píší jako data.
- **Body bez hodnoty** (1/x v nule, odmocnina ze záporného čísla) jsou v křivce mezerou, graf se kvůli nim nezahodí. Chybějící proměnná nebo chybný zápis graf zastaví jako každý jiný řádek.
- **Druhy:** `kind: "line"` (výchozí; křivka s nejvýš 30 body ukáže i body), `"points"`, `"bar"`. Nejvýš 8 křivek (`E-PLOT-SERIES`).
- **Vzhled:** barvy v pevném pořadí ověřené pro barvoslepé, k tomu čárkování a tvary bodů, aby se křivky rozlišily i v černobílém tisku; legenda od dvou křivek, do čtyř křivek i jména na konci křivek. Osy s kulatými hodnotami (1, 2, 2,5, 5 × 10ⁿ), čísla podle jazyka tisku. Graf se kreslí jako SVG, ostrý v PDF i při zoomu.
- **V editoru** ukáže najetí myší svislou čáru a hodnoty všech křivek v nejbližším bodě. **Vložit → Graf** vloží graf poslední funkce jedné proměnné v listu (jinak ukázku `plot(sin(x), x: 0 .. 2·π)`).
- **Umístění** jako u obrázku (11.1): `plot(M(x), x: 0 m .. L, place: "width=40% wrap=right dx=6% dy=8mm")`. Bez `place` má graf celou šířku. V editoru pravé tlačítko na grafu otevře menu obtékání a šířky, zúžený graf jde chytit myší a položit kamkoli na stránce (zápis `place` doplní program); klik bez tažení otevře řádek. `side=` je jen pro obrázky.
- Chyby: zápis (`E-PLOT-FORM`), druh (`E-PLOT-KIND`), rozsah pozpátku (`E-PLOT-RANGE`), počet bodů (`E-PLOT-SAMPLES`), řady různé délky (`E-PLOT-LENGTH`), umístění (`E-PLOT-POSITION`).

- **Výška grafu (2026-10-12):** `place: "width=60% ratio=0.6"` dává poměr výšky k šířce (0,1–3). V editoru ho nastaví tažení za horní nebo dolní hranu vybraného grafu; boční hrany mění jen šířku, rohy obojí v poměru.

### 7.1f Proložení naměřených bodů (2026-10-06)

```text
T_lin := fit(Mereni.T, x: Mereni.t)                     ' přímka (kind: "linear" je výchozí)
T_par := fit(Mereni.T, x: Mereni.t, kind: "poly2")      ' parabola
T_60 := T_par(60 s)                                      ' proložená křivka jako funkce
plot(Mereni.T, T_lin(x), T_par(x), x: Mereni.t)         ' body a křivky v jednom grafu
```

- **`fit(y, x: řada, kind: …)`** proloží body metodou nejmenších čtverců. Druhy: `linear` (a + b·x), `poly2`, `poly3`, `exp` (a·e^(b·x)), `power` (a·x^b), `log` (a + b·ln x); `exp`, `power` a `log` se prokládají na logaritmech a potřebují kladné hodnoty.
- **Výsledek je funkce** jedné proměnné, pojmenované po sloupci x (`t`), s koeficienty v jednotkách: `T_lin(t) = 20,7 °C + 0,428 Δ°C/s·t`. V tisku je pod voláním rovnice s čísly a **R²**.
- **Graf:** když je osa x řada naměřených hodnot (`x: Mereni.t`), čárový graf nakreslí data jako **body** a funkci proměnné (`T_lin(x)`) jako **čáru** přes celý rozsah.
- Chyby: zápis (`E-FIT-FORM`), druh (`E-FIT-KIND`), málo bodů (`E-FIT-POINTS`), záporné hodnoty u logaritmických druhů (`E-FIT-POSITIVE`), body bez jednoznačné křivky (`E-FIT-SINGULAR`).
- *Na později:* vlastní tvar s parametry (`fit(a + b·t + c·e^t, …)`), kosmetika tisku (osa podle sloupce, zápis záporných koeficientů).

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
| `filter(T, where: …)` | podmnožina řádků jako tabulka: `filter(Profily_IPE, where: r.W_y ≥ 300 cm³).G` je řada, na výsledek jdou `pick`, `find_min` i další `filter`; v tisku jsou vybrané řádky pod vzorcem (2026-10-11) | F10 ✓ |

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

### 8.4 Tabulka v listu (2026-10-06)

**Úprava v mřížce (2026-10-09):** klik na tabulku v listu ji otevře jako mřížku buněk (Enter dolů, na posledním řádku přidá řádek; Shift+Enter nahoru; Tab vpravo; Esc konec). Záhlaví se píše `název [jednotka] {formát}`. Zápis v textu se při tom zarovná do sloupců. Novou tabulku vloží Vložit → Tabulka v listu.

```text
table Mereni:
    | t [s] | T [°C] {0.0} | poznamka |
    | 0     | 20.1         | start    |
    | 10    | 25.3         |          |
```

- **Obecná tabulka přímo ve výpočtu** (naměřené body, vlastní data); katalogové tabulky (profily, materiály, průměry nýtů) zůstávají ve vrstvě Data. Řádek `table Jmeno:` a pod ním odsazené řádky `| … |` (v editoru Shift+Enter); první řádek je záhlaví: jméno sloupce, jednotka v `[ ]`, formát čísel v `{ }` (`{0.0}` jedno desetinné místo, `{0}` žádné).
- **Ve výpočtu** je to tabulka jako z vrstvy Data: `Mereni.T` je řada v °C, `Mereni.t[3]` jedna hodnota, fungují `pick`, `find_min`, `interpolate`. Sloupec samých čísel je číselný, jiný textový; prázdné řádky se přeskočí.
- **V tisku** tabulka se záhlavím a jednotkami, čísla podle formátu a vpravo.
- **Počítaný sloupec a součty (2026-10-10), např. rekapitulace zatížení:**

  ```text
  γ_G := 1.35
  table Stale:
      | polozka | h [mm] | ρ [kN/m³] | g_k [kN/m²] = h·ρ | g_d [kN/m²] = g_k·γ_G |
      | dlažba  | 10     | 22        |                   |                       |
      | beton   | 150    | 25        |                   |                       |
      | Celkem  |        |           | Σ                 | Σ                     |
  g := sum(Stale.g_d)
  ```

  - Vzorec stojí v záhlaví za `=`. Prázdné buňky sloupce se spočtou po řádcích ze sloupců téhož řádku a z hodnot listu nad tabulkou. Vyplněná buňka platí, jak je napsaná (ruční výjimka). Sloupce se počítají zleva, takže vzorec smí číst počítaný sloupec vlevo od sebe. Ve vzorci mají jména sloupců přednost před jednotkami (`h` je výška, ne hodina).
  - Výsledek se převede na jednotku záhlaví. Jiný rozměr je chyba `E-TABLE-FORMULA`.
  - Buňka `Σ` sečte sloupec od posledního řádku součtů, takže jde i o mezisoučty (stálé, proměnné). Řádek součtů nepatří mezi data: `sum(Stale.g_d)` sečte jen řádky položek.
  - V tisku je vzorec pod záhlavím sloupce a řádek součtů tučně s čarou nad ním. Jména sloupců se sázejí jako ve vzorcích (g_k s indexem).
- *Na později (kosmetika):* úprava v mřížce přímo v listu, formáty jako v Excelu (procenta, vědecký zápis, zarovnání, tučně, pozadí) z nabídky pravého tlačítka.

### 8.4a Buňky: řádky vedle sebe (2026-10-12)

Řádek stránky může mít víc buněk: text a vedle něj definici, dva výsledky, krátké výpočty ve sloupcích. Každá buňka je obyčejný řádek zápisu.

```text
"Zatěžující síla"
F := 1600 N {beside}
```

- V editoru: **Tab** na konci otevřeného řádku přidá vpravo novou buňku; pravé tlačítko na řádku → **Dát vedle předchozího řádku** / **Na samostatný řádek**; prázdná buňka zmizí Backspacem.
- Značku `{beside}` na konci řádku píše program; ručně ji psát není třeba. Řádek se značkou stojí vedle řádku nad sebou, a tak dál, dokud řádky značku mají.
- V tisku i v editoru stojí buňky vedle sebe na jedné stránce; poslední buňka zabere zbytek šířky.

### 8.5 Pozice výpočtu (2026-10-11)

Statický výpočet se člení na pozice (německá „Positionsstatik“): Pos. 1 Stropní deska, Pos. 2 Průvlak… Každá pozice počítá se svými jmény, reakce jedné pozice je zatížením další.

```text
## Stropní deska {pos}          ' v tisku: Pos. 1  Stropní deska
q := 5 kN/m
L := 4 m
A := q·L/2
## Průvlak {pos}                ' Pos. 2
F := Pos1.A                     ' reakce stropu; v tisku A (Pos. 1)
L := 6 m                        ' L smí znovu: jména Pos. 1 skončila s ní
A := F/2
## Sloup {pos=7}                ' číslo podle projektu; {pos=3a} pro vloženou pozici
N := Pos2.A + Pos1.A
```

- `{pos}` za nadpisem (v editoru pravé tlačítko na nadpisu → Začíná pozici výpočtu) otevře pozici. Čísluje se 1, 2, 3; zadané číslo (`{pos=7}`) číslování posune, označení jako `3a` ne.
- Jména definovaná v pozici platí do začátku další pozice. Potom jsou hodnotami pozice: `Pos1.A`. Jména nad první pozicí (materiály, součinitele) platí všude.
- Poslední pozice svá jména drží až do konce listu, takže je vidí i ostatní vrstvy a živé hodnoty plátna.
- **Číslování stran po oddílech (2026-10-11):** Vlastnosti výpočtu → Číslování stran → Po oddílech. Každá pozice (bez pozic nadpis nejvyšší opakované úrovně, např. `##`) a každá příloha začne na nové straně; strany pozice 2 jsou Strana 2.1, 2.2 (v závorce pořadí v celém tisku), přílohy A.1, A.2, strany před prvním oddílem 1, 2. V záhlaví je vedle názvu listu i název oddílu (Pos. 2 Průvlak).

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
- **Soustava bez odhadu (2026-10-05):** když Newton z výchozích hodnot nedokonverguje, program zkusí neznámé bez vlastního odhadu znovu z jiných velikostí a znamének (každou trochu jinak, aby Jakobián nezůstal singulární). Jednotky neznámých soustavy dál dává `guess`.

*Upřesněno při implementaci F8:*
- Rovnice soustavy stojí na odsazených řádcích pod `solve` (v editoru Shift+Enter), nebo na jednom řádku oddělené čárkou (česky středníkem): `solve (x; y): x² + y² == 25; y == x + 1 guess x = 1; y = 1`.
- Neznámá dostane jednotku z intervalu (`in 0 s .. 10 s`) nebo z odhadu (`guess I_1 = 1 A`). Bez nich je bezrozměrná a začíná na 1.
- Neznámé jsou od řádku `solve` obyčejné hodnoty listu (i když se píší jako jednotka, např. `t`). Nad ním je použít nejde (E-DEFINED-LATER) a nesmí být definované dřív (E-REDEFINED).
- Když konce intervalu nemají opačné znaménko, řešič hledá změnu znaménka uvnitř intervalu (najde kořen nejblíž dolní mezi). Body, kde rovnice nemá hodnotu (dělení nulou, mimo definiční obor), přeskočí.
- Chyby: jiný počet rovnic než neznámých (E-SOLVE-COUNT), bez kořene v intervalu (E-SOLVE-NO-ROOT), Newton nekonverguje (E-SOLVE-NO-CONVERGENCE, zkuste jiný odhad), rovnice na sobě závisí (E-SOLVE-SINGULAR), strany rovnice s jinou jednotkou (E-UNIT-MISMATCH).
- V tisku jsou rovnice se znakem „=“, u jedné neznámé i interval („0 ≤ x ≤ 10“) a pod nimi nalezené hodnoty.
- Pozor na zápis `2 m/s²·t²`: za číslem vyhrávají jednotky, takže `t` je tu tuna. Správně je `(2 m/s²)·t²`.
- **Vyjádření vzorcem (2026-10-05):** jednu neznámou program nejdřív vyjádří vzorcem: `solve L: M_Ed == q·L²/8` dá `L = √(8·M_Ed/q)`, `solve d: τ_dov == 16·M_k/(π·d³)` dá `d = ∛(16·M_k/(τ_dov·π))`. Umí to s `+ − · /`, mocninou s pevným exponentem, `√ ∛`, `exp`, `ln`, `log10`, `sin`, `cos`, `tan`, `abs`, a s neznámou zapsanou víckrát, když je rovnice lineární nebo kvadratická. Neznámá dostane jednotku ze vzorce, interval ani odhad nejsou potřeba. Kde vzorec najít nejde (`x·exp(x) == 3`, soustavy), řeší se numericky jako dřív.
- **Víc kořenů:** každý se dosadí zpět do rovnice. Vybere interval (kořen nejblíž dolní mezi), jinak odhad `guess` (nejbližší), jinak jediný kladný. Dva kladné bez intervalu jsou chyba `E-SOLVE-ROOTS`, která oba vypíše.
- **V tisku** je pod rovnicí vyjádřený vzorec, dosazení a výsledek (vzorec ze samých čísel se vynechá). V editoru pravé tlačítko na řádku `solve` nabídne **Vložit vzorec jako definici**: řádek se nahradí definicí `L := sqrt(8·M_Ed/q)` s komentářem, z jaké rovnice vznikla.
- **Nerovnice (2026-10-06):** `solve d: S_min ≤ π·d²/4` (také `<`, `>`, `≥`, `<=`, `>=`) najde hranici neznámé jako u rovnice a zkouškou těsně nad ní a pod ní určí, na které straně leží řešení; znaménko se tak otočí samo i při dělení záporným číslem (`-2·x ≤ 4` dá `x ≥ −2`). V tisku jako ve sbírce: `S_min ≤ π·d²/4 ⇒ d ≥ √(4·S_min/π) = … = 5,473 mm`. Neznámá dostane hodnotu hranice (nejmenší, či největší přípustnou). Jen jedna neznámá a jedna nerovnice (`E-SOLVE-INEQUALITY`); kde nerovnice platí na obou stranách hranice nebo na žádné (`x² ≥ 0`), chyba `E-SOLVE-SIDE`.

### 9.0a Diferenciální rovnice s okrajovými podmínkami (2026-10-11)

Ohybová čára nosníku bez tabulkových vzorců:

```text
q := 10 kN/m
L := 6 m
E := 210 GPa
I := 8360 cm^4
M(x) := q·x·(L − x)/2
solve w(x): E·I·w″ == −M(x) in 0 m .. L
    w(0 m) == 0 m
    w(L) == 0 m
w_max := w(L/2) | mm                 ' 9,612 mm = 5·q·L⁴/(384·E·I)
φ_A := w′(0 m)                       ' natočení v podpoře
plot(w(x), x: 0 m .. L) | mm         ' průhybová čára
```

- `solve w(x): …` hledá funkci. Derivace se píší jako v knize: `w′ w″ w‴ w⁗` (tlačítka ′ a ″ v liště Operátory; obyčejný apostrof je komentář). Interval `in a .. b` je povinný.
- Rovnice řádu n potřebuje n okrajových podmínek na funkci nebo její derivace v libovolných bodech intervalu: podpora `w(0 m) == 0 m`, vetknutí navíc `w′(0 m) == 0`, volný konec konzoly `w″(L) == 0 m^-1` a `w‴(L) == 0 m^-2`. Jednotka funkce plyne z podmínek. Jde i 4. řád (`E·I·w⁗ == q`) a 1. řád (`y′ == −y/τ`, `y(0 s) == 1`).
- Rovnice se řeší pro nejvyšší derivaci (bere se, že je v ní lineární), integruje se Rungeho–Kuttovou metodou 4. řádu na 200 krocích a hodnoty na začátku, které podmínky nechávají otevřené, dopočte metoda střelby (Newton; pro lineární rovnici přesně v jednom kroku).
- Výsledek je funkce: `w(x)`, `w′(x)`, `w″(x)` (mezi body sítě Hermiteovou interpolací), mimo interval chyba `E-DOMAIN`. `w′(bod)` u obyčejné funkce listu spočte derivaci numericky (řád 1 a 2).
- Chyby: chybí interval (`E-ODE-RANGE`), rovnice bez derivace nebo nelineární v nejvyšší (`E-ODE-FORM`), podmínka v jiném tvaru (`E-ODE-CONDITION`), počet nebo nezávislost podmínek (`E-ODE-CONDITIONS`), bod mimo interval (`E-ODE-POINT`).

### 9.1 Odvození (řetěz rovností s kontrolou)

- **Odvození funkce (2026-10-09):** `dV(z) := 2·ε_xx(z) + ε_zz == −ρ·g/E·(3·h − 2·z − a)`. Parametr se při kontrole mění jako symbol v rozměru, se kterým mají všechny členy hodnotu; funkce se počítá z posledního členu. Funkce listu se při kontrole rozvinou do svých vzorců.

```text
y := M/(E·I) == F·l^3/(3·E·I)                      ' odvození končí definicí: y z posledního členu
M_Ed := q·L²/8 == 12 kN/m·(5 m)²/8 == 37.5 kN·m      ' i s dosazením čísel
derive M_mp := l^3·F/3                              ' značka teorie, bez hodnot
derive w := M_mp/(E·I) == (l^3·F/3)/(E·I) == F·l^3/(3·E·I)
derive E·integral(y^2, dS) == integral(E·y^2, dS)  ' odvození samo, nic nedefinuje
```

- **Zápis jako v učebnici:** členy spojené `==` (v odvození stačí i `=`). Za `:=` je to odvození, které končí definicí veličiny: hodnota se spočítá z posledního členu. Samotné `derive a == b == c` jen ověří kroky.
- **Každý krok se ověří obecně**, ne jen pro čísla výpočtu: všechna jména dostanou v pěti bodech náhodné hodnoty (veličiny výpočtu si ponechají jednotku) a obě strany kroku musí vyjít stejně, hodnotou i rozměrem. Úprava, která platí jen pro jedno číslo (`x² == 2·x`), neprojde. **Krok s dosazenými čísly** (strana bez jmen, `== 12 kN/m·(5 m)²/8`) platí jen pro hodnoty výpočtu, proto se ověří s nimi.
- **Rovná se po zaokrouhlení (2026-10-10):** `d := sqrt(4·S/π) == 5.47 ≐ 5.5 mm`. Krok `≐` (stejně `≈`) platí, liší-li se členy nejvýš o 1 %; `==` zůstává přesné. Hodnota je z posledního členu. Znak vloží tlačítko ≐ v nástrojové liště Operátory; převod vzorců z PDF ho zachová.
- **Přiblížení pro malé hodnoty:** krok `≐` mezi značkami teorie, který pro běžné hodnoty neplatí, se ověří ještě se značkami zmenšenými (všemi, nebo jednou z nich): `derive sin(γ) ≐ γ` projde, `derive γ ≐ 2·γ` ne. Vztah, kterým kniha veličinu zavádí (zkos z geometrie tg γ = Δl/l), je třeba napsat jako definici: `derive γ := atan(Δl/l)` a pod ní `derive γ ≐ tg(γ) == Δl/l`.
- **Funkce jako v českých knihách:** `tg(x)` a `cotg(x)` (stejné jako `tan`, `cot`). Převod vzorců z PDF doplní závorky, které kniha vynechá (`tg γ` → `tg(γ)`).
- **Vypočtená veličina zastupuje svůj vzorec:** je-li výše `M := q·L²/8`, mění se v ověření jen `q` a `L` a `M` s nimi drží vztah. Veličina odvozená až k číslu zastupuje svůj první člen.
- **Volná jména:** v odvození je nedefinované jméno značkou, i když zní jako jednotka (`F`, `l`, `E`). Jednotky se tu píší jen za čísly (`5 m`) nebo v hranatých závorkách. `derive M_mp := l^3·F/3` zavede značku teorie: hodnotu nemá a neohlásí chybu, ale odvození pod ní s ní počítají jako se vzorcem.
- **Dva členy:** `y := a == b` je odvození, když jde o hodnoty. Porovnáním (pravda/nepravda) zůstane, obsahuje-li text, `true`/`false`, `and`/`or`/`not`, `<` nebo `≠`, nebo když obě strany vyjdou jako text či logická hodnota: `ok := m.trida == "S235"`.
- **Σ a ∫ bez mezí** jsou zápis teorie: `sum(ΔS·y^2)` → Σ ΔS·y², `sum(F_i·a_i, i)` → Σᵢ F_i·a_i, `integral(y^2, dS)` → ∫ y² dS. V odvození se chovají lineárně (pořadí uvnitř, konstanta před), spočítat bez mezí nejdou (`E-NO-BOUNDS`). `sum(řada)` dál sečte řadu.
- **V tisku:** y = první člen = další členy = dosazení = **výsledek**, v úsporném stylu na jednom řádku se zalomením na rovnítku. Pod odvozením, jehož všechny kroky platí, je značka „✓ odvození ověřeno“.
- **Chyby:** krok neplatí (`E-DERIVE-STEP`), strany kroku mají různé jednotky (`E-DERIVE-UNITS`). Hodnota z posledního členu se i tak spočítá, aby se zbytek výpočtu nerozpadl. Krok, který pro zkusmé hodnoty nemá hodnotu, je varování (`W-DERIVE-UNVERIFIED`).
- **V editoru:** panel Funkce, tlačítko a=b vloží řádek `derive`.

---

## 10. Podmínky (posudky)

**Souhrn posudků (2026-10-09):** tabulka všech posudků nahoře na první stránce je generovaná, nepíše se. Klik na posudek v ní otevře jeho řádek `check` k úpravě (tam jde i smazat). Pravé tlačítko na souhrnu nebo Vlastnosti výpočtu: souhrn nahoře / na konci / nezobrazovat (`layout.json`, `summary`). Výsledek posudku slovem podle Vlastností výpočtu: VYHOVUJE / NEVYHOVUJE (výchozí), VYHOVÍ / NEVYHOVÍ, nebo jen ✓ / ✗ (`verdict`).

```text
check "Ohyb": σ ≤ material.fy        source "EN 1993-1-1, 6.2.5"
check "Rozpočet": N_celk ≤ 2_500_000 CZK   source "zadání investora"
```

- Výsledek: ✓ / ✗, **využití** = levá strana / pravá strana (u `≤`, `<`), případně obráceně (u `≥`, `>`).
- Využití se počítá jen pro jedno porovnání kladných hodnot. Podmínka typu `a and b` nebo s absolutními teplotami jen vyhoví / nevyhoví.
- Popisek (`"Ohyb":`) i `source` jsou volitelné. `check` a `source` jsou vyhrazená slova.
- Podmínka, kterou nešlo vyhodnotit (chyba ve vstupech), se v souhrnu vede jako **nevyhodnocená a nevyhovující**, aby nemohla zapadnout.
- **Dohledání původu** (`kalketa trace list.cc σ`): strom vzorců a vstupů až k řádkům tabulek a jejich zdrojům. Řádky, které `find_min` jen zkoušel, se za zdroj nepovažují, jen vybraný řádek.
- `source` je volitelný text nebo odkaz do tabulky zdrojů listu.
- **Zdroj i u definice (2026-10-11):** `M_Ed := 1.35·G_k + 1.5·Q_k | kN·m  source "EN 1990, 6.10"`. V tisku je za vzorcem v hranatých závorkách jako u posudku, ve stylu se sloupci v levém sloupci.
- **Styl se sloupci (2026-10-11)**, Vlastnosti výpočtu → Styl výpočtu → Se sloupci: britský výpočtový list. Vlevo odkaz (`source` definice a posudku, citace textu `[T1]`, zdroj tabulky u `pick`), uprostřed vzorec a dosazení, vpravo výsledek se jménem (M_Ed = 54 kN·m) a u posudku využití a verdikt. Nadpisy, obrázky a grafy jsou přes celou šířku. Na každé stránce je nahoře záhlaví Odkaz / Výpočet / Výsledek. Kontrolor čte pravý sloupec a ke každému číslu najde vlevo, odkud je.
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
| `@digits 3` | počet platných číslic pro tento a další řádky |
| `{decimals=2}` / `{digits=3}` na konci řádku (před komentářem) | jen tento výsledek: desetinná místa / platné číslice; platí i pro dosazení této veličiny ve všech vzorcích níže. Výpočet běží dál s přesnou hodnotou, ledaže řádek má i `rounded` (`{decimals=2 rounded}`): pak řádky níže počítají se zaokrouhlenou hodnotou, takže součet zobrazených hodnot je zobrazený součet. V editoru pravé tlačítko na řádku → Výsledek na celé číslo / na 1–4 desetinná místa (s ukázkou výsledku) a zaškrtnutí „Počítat dále se zaokrouhlenou hodnotou“; platné číslice jen zápisem v textu (2026-10-09) |
| `{size=12 font=serif italic bold}` na konci textového řádku | velikost písma (6–48 pt), písmo podle druhu (`serif` patkové, `sans` bezpatkové, `mono` neproporcionální), kurzíva, tučné, `align=left|center|right|justify`, `color=gray|blue|red|green`; platí i pro nadpisy (`## Zadání {color=blue}`). Uvnitř textu `*kurzíva*` a `**tučné**` jako v Markdownu. V editoru se text upravuje naformátovaný jako ve Wordu: uvozovky a značky jsou skryté a program je zapíše sám. Tučné a kurzívu (Ctrl+B, Ctrl+I) lze dát i části textu. Písmo, velikost, barva, styl odstavce (Normální, Nadpis 1–3; Ctrl+Alt+0–3) a zarovnání (Ctrl+L/E/R/J) se nastaví v menu Formát nebo v panelu Vlastnosti nahoře v postranním panelu. „Upravit jako zápis“ otevře řádek se značkami. Napsaná `"` se mění na typografické „ “. Pravé tlačítko nabídne totéž; na označeném řádku platí volba pro všechny označené (2026-10-09, 2026-10-12) |
| `{eq}` / `{noeq}` / `{eq=hooke}` na konci řádku | číslo rovnice vpravo (1), (2) … ano / ne bez ohledu na nastavení; `{eq=hooke}` rovnici pojmenuje a text `(#hooke)` se vysází jejím číslem. Co se čísluje samo, určují Vlastnosti výpočtu → Čísla rovnic (nečíslovat / vzorce a odvození / všechny výsledky); knižní styl (vzorce na střed) čísluje vzorce, dokud se nenastaví jinak; v editoru pravé tlačítko na řádku (2026-10-09) |
| `@page` | zalomení stránky |
| `@clear` | konec obtékání: další řádky začnou pod obtékaným obrázkem (Vložit → Konec obtékání) |

Výchozí zobrazení pro tisk je **vzorec → dosazení → výsledek** (standard technických výpočtů, převzato z Calcpadu i UzonCalc). Pomocné výpočty jde přesunout do pracovní vrstvy, a pak se netisknou vůbec.

### 11.1 Obrázky v listu

Obrázek je v listu samostatný řádek zapsaný jako v Markdownu (stejně jako v poznámkách):

```
![Schéma nosníku](images/sheet/schema-nosniku.png){width=60%}
```

- Popis v hranatých závorkách je nepovinný. Obrázek s popisem se v tisku čísluje: **Obr. 1: Schéma nosníku**.
- `{width=60%}` je šířka v procentech šířky textu, obrázek je vycentrovaný. Bez ní má obrázek svou velikost (nejvýš šířku textu).
- Soubor obrázku je uložený **uvnitř souboru výpočtu** (`images/sheet/…`, u vrstev `layers/<id>/images/…`). Výpočet tak jde předat jako jeden soubor.
- **Vložení:** přetažením souboru na list (obrázek se vloží za řádek pod myší), Ctrl+V (zkopírovaný obrázek, snímek obrazovky, nebo soubor obrázku zkopírovaný v Průzkumníku či ve správci souborů v Linuxu) a Vložit → Obrázek…
- Snímek obrazovky dostane šířku podle své velikosti na obrazovce (96 dpi), nejvýš celou šířku textu. **Velikost se mění tažením za roh** vybraného obrázku; řádek se upraví sám.
- **Obrázek vedle textu:** `{width=40% side=right}` (nebo `side=left`) postaví obrázek vpravo (vlevo) vedle řádků, které za ním následují, až po nejbližší prázdný řádek, nadpis, další obrázek nebo `@page`. Řádky a obrázek tvoří dva sloupce, které zůstanou na jedné stránce. Je-li skupina vyšší než stránka, obrázek se vrátí doprostřed nad řádky. Šířka je podíl sloupce s obrázkem (nejvýš 70 % při tažení).
- **Obtékání:** `{width=35% wrap=right}` (nebo `wrap=left`) postaví obrázek na okraj a následující řádky jdou vedle něj až do jeho spodního okraje, pod ním v plné šířce. Obtéká se po celých řádcích výpočtu, vzorec se nikdy nerozdělí; řádek, který se vedle obrázku nevejde, se zúží. Obtékání jde ukončit na zvoleném řádku řádkem `@clear`, u obrázku zrušit v nabídce položkou **Zrušit obtékání** (obrázek zůstane na své straně, jen bez obtékání).
- **Volné umístění:** `{width=35% wrap=right dx=20% dy=15mm}` posune obtékaný obrázek (i plátno) o `dx` procent šířky textu od jeho okraje a o `dy` milimetrů pod řádek, ke kterému patří; řádky výpočtu ho obtékají z širší strany a nad ním zůstávají v plné šířce. V editoru se obrázek i plátno chytí myší a za kurzorem jde jeho průsvitný náhled; kde se pustí, tam zůstane (jako na snímku v prezentaci). Program sám určí řádek, ke kterému patří (modrá čára), stranu obtékání (širší strana) a obě odsazení. Obrázek široký jako text se jen přesune mezi řádky. `dx` a `dy` bez `wrap` jsou chyba.
- **Bez obtékání:** `{wrap=none}` (s `align=left|right` nebo na střed) text nikdy neobtéká: obrázek stojí sám na svých řádcích a tažením se přesouvá mezi řádky a ke kraji nebo na střed podle místa puštění. Pravé tlačítko na obrázku či plátně otevře menu obtékání: podle umístění, bez obtékání, vpravo, vlevo, ke kraji (zrušit odsazení), zarovnání.
- **Zarovnání bez obtékání:** `{width=35% align=right}` (nebo `align=left`) postaví obrázek k pravému (levému) okraji, řádky zůstanou pod ním; bez `align` je obrázek uprostřed. `side`, `wrap` a `align` se navzájem vylučují. Umístění se volí pro každý obrázek zvlášť (Umístění), takže soubor vypadá všude stejně.
- **Přesun:** obrázek se chytne myší a přetáhne mezi jiné řádky; modrá čára ukazuje, kam přistane.
- **Myší:** klik na obrázek ho vybere (úchyty ve čtyřech rozích) a otevře nabídku vedle něj: Popisek, Šířka, Umístění (na střed / vpravo / vlevo vedle textu), Nahradit obrázek, Upravit zápis, Odstranit. Pravé tlačítko otevře nabídku u kurzoru, dvojklik otevře zápis řádku.
- Chybný zápis hlásí `E-PICTURE-SYNTAX`, chybějící soubor se v tisku ukáže jako červený rámeček s cestou.

### 11.2 Plátno (grafické okno)

Plátno je kresba s volně umístěnými prvky, jako snímek v PowerPointu. V listu se chová jako obrázek: `![Schéma](canvases/platno-1.json){width=90%}`. Má tedy stejné umístění, obtékání, změnu velikosti, přesun a číslování „Obr.“ jako obrázky. Grafika je tak oddělená od výpočtu: výpočet zůstává řádek po řádku, kresba žije ve svém okně.

- **Vložit → Plátno…** vloží prázdné plátno (90 % šířky textu) a hned ho otevře k úpravě. **Dvojklik** na plátno nebo **Upravit plátno…** v jeho nabídce ho otevře znovu.
- **Úprava přímo v listu (výchozí):** kresba zůstane na svém místě ve stránce, nad listem se objeví lišta nástrojů. Klik mimo plátno, Esc nebo **Hotovo** úpravu uloží a ukončí. Tlačítko **⤢ Zvětšit do okna** (nebo **Upravit plátno v okně…** v nabídce) přenese úpravu do velkého okna pro jemnou práci. Co dělá dvojklik, se volí v **Nástroje → Nastavení → Plátno upravovat** (přímo v listu / ve velkém okně); je to nastavení programu, na soubor ani tisk nemá vliv.
- **Nástroje:** Výběr a posun (V), Text (T), Čára (L), Šipka (A), Obdélník (R), Elipsa (E), Obrázek (také Ctrl+V a přetažení souboru). Barva, tloušťka čáry, výplň a velikost písma platí pro nový prvek i pro vybraný.
- **Myší:** tažením se prvek posune, za rohy se mění velikost (obrázek drží poměr stran), u čáry a šipky se tahají konce; mřížka po 0,5 mm (Alt ji vypne). Pravý dolní roh plochy mění velikost plátna. Dvojklik na text ho upraví.
- **Klávesy:** Delete smaže, šipky posunou o 0,5 mm (se Shiftem o 5 mm), Ctrl+Z / Ctrl+Y, Esc zruší výběr; potom v listu úpravu uloží a ukončí, ve velkém okně ho zavře bez uložení (Storno). **Hotovo** uloží.
- **Uložení:** scéna je v souboru výpočtu jako `canvases/<jméno>.json` (rozměry v milimetrech), obrázky plátna v `canvases/<jméno>/`. Pro editor i tisk se kreslí jako SVG, ostré při každém zoomu i v PDF.
- **Další krok:** živé hodnoty z výpočtu v textu plátna (např. `{L}` → „5 m“), kóty a tvary.

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
