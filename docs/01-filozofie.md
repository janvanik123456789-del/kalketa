# CalcCanvas — Filozofie programu

**Verze:** 2.0 (návrh)
**Datum:** 2026-09-29
**Stav:** Návrh k diskusi. Nahrazuje `calc-canvas/01-philosophy.md`.

---

## 1. Vize v jedné větě

> **Obecný technický výpočtář jako Mathcad, který umí dobře pracovat s daty. Tabulky, obrázky a zdroje jsou součástí výpočtu, ne programu.**

Uživatel vidí a tiskne klasický, čitelný výpočet. Pod ním jsou v dalších vrstvách uložena data, ze kterých výpočet vychází: tabulky profilů, materiálů, látek, kabelů, kurzů a cen, včetně obrázků a informace o původu.

---

## 2. Pro koho

Program je **oborově neutrální**. Má posloužit stejně dobře:

| Uživatel | Typický výpočet |
|---|---|
| Stavař | posouzení nosníku, výběr profilu z tabulky |
| Strojař | pevnost hřídele, tepelná bilance, šroubový spoj |
| Chemik | příprava roztoku, stechiometrie, rovnováha |
| Elektrikář | dimenzování kabelu, úbytek napětí, střídavé obvody |
| Ekonom | návratnost investice, cash flow, přepočet měn |

**Důsledek:** jádro programu nezná žádný obor. Obor do programu přinášejí **tabulky, šablony a bloky**, tedy obsah listů a knihoven, ne kód programu.

---

## 3. Základní principy

1. **Výpočet je dokument.** Výsledkem práce je list, který jde vytisknout, podepsat a předat.
2. **List je soběstačný.** Obsahuje vše, co potřebuje: výpočet, data, obrázky a zdroje. Funguje offline a za deset let dá stejný výsledek.
3. **Tisková vrstva je na prvním místě.** To, co se vytiskne, je hlavní pohled. Vše ostatní je pod ním a dá se rozkrýt.
4. **Výsledek je vždy dohledatelný** ke vzorci, vstupům, řádku tabulky a zdroji.
5. **Data jsou objekty první třídy.** Tabulka má typované sloupce s jednotkami, ne holá čísla.
6. **Jádro je oborově neutrální.** Nic, co zná jen jeden obor, nepatří do jádra.
7. **Program musí plně fungovat bez LLM.** LLM je velká pomoc, ale nikdy podmínka ani autorita výpočtu.
8. **Uživatel zapisuje jako inženýr, ne jako programátor.** Program ale nesmí tiše hádat. Nejednoznačný zápis ohlásí.
9. **Deterministické jádro.** Stejný list dá vždy stejný výsledek.
10. **Složitost je vrstvená.** Výchozí pohled je čistý výpočet, detaily jsou dostupné na vyžádání.

---

## 4. List a vrstvy

```text
List "Nosník N1"
├── Vrstva 1 – TISK        stránkový dokument (A4), konečný počet stran,
│                          čte se shora dolů, podepisuje se
├── Vrstva 2 – VÝPOČET     vzorce, proměnné, jednotky, podmínky
├── Vrstva 3 – DATA        tabulky s obrázky k řádkům, zdroje dat
├── Vrstva 4 – PRACOVNÍ    neomezený prostor: varianty, pomocné výpočty,
│                          poznámky, rozpracované věci
└── Vrstva 5 – AI          volitelná, poznámky a návrhy LLM
```

- **Tisková vrstva je stránková**, stejně jako v Mathcadu. Má konečný počet stran.
- **Ostatní vrstvy nejsou omezené.** Ve spodních vrstvách je místo i pro volné plátno.
- **Z tisku jde prokliknout do hloubky:** kliknutí na `Wy = 194 cm³` ukáže řádek tabulky, ze kterého hodnota pochází, obrázek a zdroj.
- **Přesnost výpočtu a formát tisku jsou oddělené.** Výpočet běží v plné přesnosti. Tisková vrstva určuje jednotky zobrazení, počet platných číslic a zaokrouhlení (pro celý list a podle potřeby pro jednotlivé veličiny).

---

## 5. Data v listu

### 5.1 Pravidlo: list vždy obsahuje data, která použil

| Zdroj dat | Co se uloží do listu |
|---|---|
| Malá tabulka (jednotky MB) | celá tabulka včetně obrázků |
| Velká nebo serverová databáze (pozdější fáze) | jen použité řádky + odkaz na zdroj (kde, jaká verze, kdy převzato) |

Díky tomu je list reprodukovatelný, velikost souboru zůstává rozumná a serverovou databázi jde přidat později bez změny formátu listu.

### 5.2 Práce s tabulkou ve výpočtu

- **Výběr řádku:** „Profil: IPE 200“. Hodnoty z řádku se stanou proměnnými s jednotkami.
- **Odečet s interpolací:** součinitel podle štíhlosti, zatížitelnost podle teploty. Mimo rozsah tabulky (extrapolace) program vždy upozorní.
- **Hledání řádku podle podmínky:** „nejlehčí profil, pro který platí σ ≤ fy“ nebo „nejmenší průřez kabelu, pro který je úbytek napětí ≤ 3 %“.

### 5.3 Nástroje pro tvorbu tabulek v programu

- Sloupce mají **typ a jednotku** (`h [mm]`, `M [g/mol]`, `cena [CZK]`). Program hlídá, co se do sloupce zadá.
- Každý řádek může mít **obrázek**.
- **Import a export do Excelu a CSV.** Jednotky se rozpoznají z hlavičky, a když je program nepozná, zeptá se.
- **Vypočtené sloupce**, např. hmotnost na metr = A · ρ.
- **Knihovny tabulek:** tabulka z jednoho listu jde uložit a použít v dalších.
- **Původ tabulky:** každá tabulka nese informaci o zdroji (katalog, norma, vlastní měření) a datu převzetí. Aktualizace z původního zdroje vždy ukáže, co se změnilo.

---

## 6. Obecné výpočetní jádro

Aby jádro stačilo všem oborům, musí umět:

| Schopnost | Proč / kdo to potřebuje |
|---|---|
| Veličiny s jednotkami a kontrolou rozměrů | všichni |
| **Vlastní dimenze** (měna, kusy, osoby, mol konkrétní látky) | ekonom, chemik, logistika |
| Jednotky s posunem (°C, °F) | strojař, chemik |
| **Převody závislé na datech** (kurz měny k datu) | ekonom |
| Procenta a bezrozměrné veličiny | všichni (DPH, účinnost, úbytek napětí) |
| **Komplexní čísla** | elektrikář (střídavé obvody) |
| **Vektory, řady a tabulky jako hodnoty** | ekonom (cash flow po letech), měření |
| **Data a časová období** | ekonom (úročení, splatnost), harmonogramy |
| Text a výčty (materiál, látka, třída) | všichni |
| **Řešič rovnic** | chemik (rovnováha), elektrikář (obvody), ekonom (IRR) |
| Uživatelské funkce | všichni |

### 6.1 Podmínky (posudky)

Podmínka typu `σ ≤ fy` je samostatný objekt s výsledkem ✓/✗, **mírou využití** a **odkazem na zdroj** (norma, katalog, zákon, interní směrnice). Program z podmínek automaticky sestaví souhrn, který může být na první stránce tisku:

```text
Podmínka                     Využití   Zdroj
Ohyb        σ ≤ fy            60 %  ✓  EN 1993-1-1, 6.2.5
Průhyb      w ≤ L/250         87 %  ✓  EN 1990, A1.4
Rozpočet    N ≤ limit         92 %  ✓  zadání investora
```

### 6.2 Znovupoužitelné bloky

Blok s jasnými vstupy a výstupy (např. „prostý nosník“, „dimenzování jističe“, „čistá současná hodnota“) jde vložit do jiného listu. Bloky mají verzi, aby bylo poznat, že existuje novější.

---

## 7. Reprodukovatelnost a revize

- **Zmrazení revize:** list jde uzavřít jako revizi A, B, C.
- **Porovnání revizí:** ukáže změněné vstupy a jejich dopad, např. „IPE 200 → IPE 220, využití v ohybu 94 % → 76 %“.
- **Varianty:** v pracovní vrstvě jde spočítat více variant vedle sebe. Do tisku jde jen zvolená.
- **Export do PDF s otiskem (hashem):** z vytištěného výpočtu jde ověřit, kterou revizi listu představuje.

---

## 8. Soubor listu

- List je **jeden soubor-kontejner** (ZIP, stejně jako `.docx`), který obsahuje výpočet, tabulky, obrázky a metadata.
- **Výpočet uvnitř je čitelný text:** jde porovnávat verze, verzovat v gitu a snadno s ním pracuje i LLM.
- Tabulky jsou uvnitř v otevřeném formátu (CSV nebo podobném), aby šly otevřít i bez programu.

---

## 9. LLM: pomocník, ne autorita

**Bez LLM musí fungovat vše**, včetně všech kontrol: rozměrová správnost, extrapolace, chybějící data, cykly.

LLM může:

- **převádět katalogy výrobců (PDF) do typovaných tabulek.** Člověk je zkontroluje a potvrdí.
- **kontrolovat výpočet:** chybějící posudek, podezřelá hodnota, neshoda vzorce s citovaným článkem,
- **vysvětlovat** výpočet a navrhovat vzorce a bloky,
- hledat v dokumentaci a normách.

Pravidla:

- LLM **nikdy přímo nemění výpočet**. Jen navrhuje a člověk přijme nebo odmítne.
- **Co člověk od LLM přijme, zůstane v listu trvale označené** (součást dohledatelnosti).
- Poznámky LLM se ukládají do AI vrstvy a netisknou se.

---

## 10. Referenční výpočty (testovací sada)

Jádro je hotové teprve tehdy, když projdou **všechny referenční výpočty bez kódu specifického pro jeden obor.** Pokud by některý obor vyžadoval speciální kód v jádru, je to varovný signál, že jádro není obecné.

| # | Obor | Výpočet | Co ověřuje |
|---|---|---|---|
| R1 | Stavař | Prostý nosník: ohyb, smyk, průhyb | výběr z tabulky, obrázky k řádkům, podmínky a využití, hledání nejlehčího profilu, tisk |
| R2 | Strojař | Tepelná bilance výměníku + pevnost hřídele | °C vs. K (jednotky s posunem), tabulka materiálů, vložené bloky |
| R3 | Chemik | Příprava roztoku + chemická rovnováha | mol konkrétní látky, tabulka látek, řešič rovnic |
| R4 | Elektrikář | Dimenzování kabelu + úbytek napětí | interpolace v tabulce s korekčními součiniteli, komplexní impedance, hledání nejmenšího průřezu |
| R5 | Ekonom | Návratnost fotovoltaiky (NPV, IRR) | měna, kurz k datu, řady po letech, procenta, řešič pro IRR |
| R6 | Průřezový | Fotovoltaika elektricky i ekonomicky v jednom listu | spojení oborů, více tabulek, varianty |

### 10.1 Chybové a hraniční případy (povinná součást testů)

- rozměrová chyba (sčítání metrů a sekund) → srozumitelné hlášení s místem chyby,
- extrapolace mimo tabulku → varování,
- chybějící hodnota v tabulce → chyba, ne tiché nahrazení nulou,
- cyklická závislost → hlášení s cestou cyklu,
- nejednoznačný zápis (`m` jako metr vs. proměnná) → program se zeptá nebo ohlásí,
- tabulka o velikosti několika MB → rozumná rychlost a velikost souboru,
- otevření listu offline a po změně zdrojové tabulky → stejný výsledek,
- uložení a načtení listu → beze ztráty dat (tzv. round-trip),
- list bez LLM → plná funkčnost.

---

## 11. Co není cílem (alespoň v první fázi)

- FEM, CFD, CAD,
- gigabajtové databáze uvnitř listu,
- serverová databáze (přijde v pozdější fázi, formát listu s ní už počítá),
- týmová spolupráce v reálném čase,
- obchod s moduly (marketplace),
- mobilní verze,
- složití autonomní AI agenti.

---

## 12. Otevřené otázky

1. **Technologie:** TypeScript (web, desktop přes Tauri/Electron), nebo Python? Stávající implementace jsou roztříštěné do tří verzí.
2. **Zápis výpočtu:** jak přesně vypadá textový jazyk uvnitř listu a jak moc se liší od toho, co uživatel vidí?
3. **Editor:** úprava přímo v tiskové podobě (WYSIWYG jako Mathcad), nebo textový zápis s náhledem?
4. **Formát tabulek:** CSV, SQLite, nebo něco jiného uvnitř kontejneru?
5. **Normy:** jak vést odkazy na normy a jejich verze, aby zůstaly obecné pro všechny obory?

---

## 13. Klíčové motto

> **Výpočet, který vytisknete, podepíšete a za deset let ho kdokoli dohledá až ke zdroji. V jakémkoli oboru, s LLM i bez něj.**
