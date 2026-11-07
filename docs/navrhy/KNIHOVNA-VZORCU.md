# Knihovna vzorců (návrh, 2026-11-05)

Stav: **etapa 1 je v programu (2026-11-07)**, otázky na konci jsou rozhodnuté. Co vzniklo:

- **Vložit → Vzorec z knihovny… (Shift+F4):** hledání bez diakritiky v názvu, oboru, veličině i jejím popisu, seznam obor → podobor → vzorec, tlačítka hledané veličiny, náhled vkládaných řádků s poznámkou, co se vzalo z listu a co se přejmenovalo. Dvojklik nebo Vložit zapíše řádky za řádek s kurzorem.
- **Obsah:** 33 vzorců z 16 vzorů Kalkety (`packages/library/formulas/<obor>/<id>.json`), všechny „ověřeno“: kontrolní hodnota je spočítaná nezávisle v Pythonu ze vstupů vzoru. Formát je JSON místo textu s hlavičkou: bez další závislosti na čtečce YAML, rovnice zůstává jedním řádkem jazyka výpočtu.
- **Příkladná hodnota** dostane `{example}` a varování `W-EXAMPLE-VALUE`; úprava hodnoty v editoru značku smaže. Zdroj se vloží jako `source "Kalketa, vzor R1"` a tiskne se jako u každé definice.
- **Nález v jádru:** u vzorce `X_L == ω·L` vyšlo `ω := X_L/L` 2π krát větší, stejně `ω := v/r` s poloměrem v mm. Hz, ve kterých se jen ukázal podíl, se brala jako zapsaná jednotka. Opraveno, test `core/tests/rotation-chosen.test.ts`.
- **Oblíbené (2026-11-07):** hvězdička u vzorce v dialogu (nejvýš 15, ukládá se u uživatele, ne v listu). Pravé tlačítko na řádku výpočtu, nadpisu nebo textu nabídne Vzorec z knihovny ▸ vzorec ▸ hledaná veličina a vloží řádky hned pod něj; Další vzorce… otevře dialog. V `/` je Vzorec z knihovny a každý oblíbený vzorec svým názvem, Enter otevře dialog na něm.
- **Zbývá z etapy 1:** šířka obsahu (80–100 vzorců, dnes 33). Etapy 2 až 4 beze změny.

Původní stav: myšlenka přijata 2026-11-05.

Podnět: knihovna v Open CalcSheet Studio (147 úloh a 15 příkladů vkládaných jedním klikem) a v MathPrime (99 vzorců s přeskupením na hledanou veličinu).

## Hlavní doporučení

**Dialog Vložit → Vzorec…, ve kterém kliknete na hledanou veličinu.** Program vloží vzorec upravený na ni a vstupní řádky jen pro to, co v listu ještě není. Žádný stálý panel. Obsah je běžný text výpočtu, který testy přepočítají, a každá položka říká, odkud je a jak je ověřená.

Oproti soupeřům to přidá Kalketě tři věci:

- **Ověřitelnost:** zdroj a stav ověření u každé položky a v tisku.
- **Propojení s listem:** znovu použije veličiny, které v listu jsou, a zkontroluje jejich rozměr.
- **Obsah jako data:** vlastní a firemní vzorce fungují stejně jako vestavěné. Jádro dál nezná žádný obor.

## Co už Kalketa má

| Co | Kde | K čemu se hodí |
|---|---|---|
| Dialog Vložit → Funkce… s hledáním | `InsertFunctionDialog` v `Dialogs.tsx` | Vzor pro dialog |
| Nabídka `/` na prázdném řádku | `InsertMenu.tsx` | Rychlý vstup: `/vzorec`, `/ohyb` |
| Vyjádření neznámé jako vzorce a „Vložit vzorec jako definici“ | `eval/isolate.ts`, `solve.toDefinition` | Přeskupení |
| Bloky ze souboru | `blocks/`, kap. 7.2a jazyka | Možnost vložit úlohu jako blok |
| Složky teorie: projekt, firma, uživatel | Filozofie, kap. 9.6 | Stejné pořadí pro vlastní knihovny |
| Plátno | `canvases/` | Náčrty |
| Citace zdrojů | `[T1]`, `[ST:T1]` | Zdroj vzorce v listu |

## Měření: přeskupení vzorců na jádru Kalkety

Všech 80 vzorců ze seznamu MathPrime (`formulas-en.txt`, MIT) jsem přeskupil na každou veličinu, tedy 260 úprav:

| Výsledek | Počet |
|---|---|
| Přímo jako vzorec | **250** |
| Číselně | 1 |
| Selhalo s `E-UNIT-MISMATCH` | 9 |
| Obě strany rovnice po dosazení nesouhlasily | 0 |

Z těch 9 je 7 skutečné omezení, ručně ověřeno na zástupcích: neznámá dvakrát v rovnici (`R_v == R_1·R_2/(R_1 + R_2)`) a mocnina s neceločíselným exponentem (izoentropické vztahy). 2 případy u von Misese selhaly jen v testu, s rozumnými hodnotami to spočítá. **Stačí první odhad s jednotkou,** který knihovna zná ze svých dat:

```text
solve(R_v == R_1·R_2/(R_1 + R_2), R_1: 1 Ω)    ' 3,333 Ω
solve(p_1/p_2 == (V_2/V_1)^κ, V_1: 1 m^3)      ' 1,829 m³
```

Oba výsledky souhlasí s výpočtem v Pythonu. Pro jádro z toho plynou dvě drobnosti: hláška bez odhadu je matoucí, má říct „zadejte první odhad s jednotkou“, a `isolate` by mohl umět víc tvarů. Knihovna na to čekat nemusí.

## Jak se to ovládá

**Vstup (rozhodnuto 2026-11-05):**

- **Velká knihovna:** horní menu Vložit → Vzorec… otevře samostatné okno. Vzorec se v něm rozbaluje kaskádově: obor, podobor, vzorec. Nahoře je hledání v názvu, oboru i veličině („ohyb“, „σ“, „výkon“).
- **Oblíbené vzorce v nabídce pravého tlačítka:** ve velkém okně si uživatel hvězdičkou vybere vzorce, které používá. Pravé tlačítko je pak nabídne přímo v listu, u každého s hledanou veličinou: Ohybové napětí ▸ σ, M, W. Vlastní vzorce lze označit stejně.
- **Návrh k upřesnění:** oblíbených může být nejvýš asi 10 až 15, jinak nabídka přestane být rychlá. Ukládají se u uživatele, ne v listu. Stejné položky může nabídnout i `/` na prázdném řádku.

```text
┌ Vložit vzorec ──────────────────────────────────────┐
│ [ ohyb                                           ]  │
│ Ohybové napětí                     Pružnost, pevnost│
│ Průhyb prostého nosníku            Nosníky          │
│─────────────────────────────────────────────────────│
│ Ohybové napětí                                      │
│ σ = M / W            Zdroj: učebnice ✓ ověřeno      │
│                                                     │
│ Co hledáte?  [σ]  [M]  [W]                          │
│                                                     │
│ Do listu se vloží:                                  │
│   σ_dov := 160 MPa    ' dovolené napětí  ← upravit  │
│   M je už v listu (54 kN·m)                         │
│   W := M/σ_dov | cm³                                │
│                                 [Vložit]  [Zavřít]  │
└─────────────────────────────────────────────────────┘
```

- **Náhled vloženého textu** přímo v dialogu, jako v plochých nabídkách.
- **Veličiny z listu:** když je jméno v listu a má správný rozměr, použije se. Když má jiný rozměr (`L` v litrech), dialog nabídne jiné jméno, třeba `L_2`.
- **Vstupy** dostanou příkladnou hodnotu a komentář. Označí se jako nevyplněné, aby příklad nezůstal v listu omylem. Doporučuji varování, dokud je uživatel nezmění.
- **Dvě neznámé:** když jich chybí víc, vloží se všechny jako vstupy.
- **Bez přeskupení:** když nejde vyjádřit vzorcem, vloží se `solve` s prvním odhadem.

Vlastní vzorec: označit řádek a zvolit „Uložit do knihovny…“. Program navrhne veličiny a jednotky a zeptá se na název a zdroj.

## Dva druhy položek

| | Vzorec | Úloha |
|---|---|---|
| **Příklad** | `σ = M/W` | Posouzení ocelového nosníku na ohyb |
| **Obsah** | Jedna rovnice | Více řádků, posudek, případně tabulka a náčrt |
| **Přeskupení** | Ano | Ne, má pevné vstupy |
| **Vložení** | Řádky v listu | Řádky v listu, později volitelně jako blok |

**Rozhodnuto 2026-11-05:** úloha se vkládá jako **běžný text výpočtu**: uživatel vybere třeba nosník na dvou podporách a do listu se vloží nadpis, vstupy, výpočet a posudky jako řádky Kalkety, které jde dál upravovat. Každý krok je vidět a vytiskne se.

Aby šlo stejnou úlohu vložit víckrát, vloží se pod nadpis s pozicí (`## Nosník na dvou podporách {pos}`). Jména pak platí jen v pozici a další nosník se s prvním nebije, hodnoty jsou dostupné jako `Pos1.M`. Ověřeno na jádru: dvě vložení stejné úlohy spočítala každá své hodnoty bez chyby. Později může v okně knihovny přibýt přepínač **Vložit jako výpočet / jako blok** pro opakované úlohy, výpočet zůstává výchozí. Formulář se vstupy jako u modulů CalcSheetu zatím nedělat.

## Formát obsahu

Běžný soubor výpočtu s hlavičkou, po jednom souboru na položku. Text tak jde přímo spočítat.

```text
---
id: pruznost-ohybove-napeti
kind: vzorec
field: Pružnost a pevnost
title: { cs: Ohybové napětí, en: Bending stress }
source: { cs: "Základní vztah pružnosti", kind: ucebnice }
status: overeno
quantities:
  σ: { cs: ohybové napětí, en: bending stress, unit: MPa, example: 160 MPa }
  M: { cs: ohybový moment, en: bending moment, unit: kN·m, example: 50 kN·m }
  W: { cs: průřezový modul, en: section modulus, unit: cm³, example: 300 cm³ }
checks:
  - { given: { M: 50 kN·m, W: 300 cm³ }, σ: 166.67 MPa }
---
σ == M/W
```

**Kde leží, od nejbližší:** list, projekt, firma, uživatel, vestavěná knihovna. Stejné pořadí jako u teorie. Jde o obsah, ne o kód, takže splňuje zásadu z filozofie, že obor přinášejí data.

## Ověřování

Tím se má Kalketa od soupeřů lišit. Stav vidí uživatel v dialogu a zdroj se dostane do listu jako citace:

| Stav | Znamená | Podmínka |
|---|---|---|
| **Ověřeno** | Hodnota sedí na nezávislý výpočet | Kontrola v `checks` s jinou cestou nebo ze zdroje |
| **Spočítáno** | Vzorec jde spočítat, nezávisle neověřen | Projde automatické testy |
| **Vlastní** | Od uživatele | Bez záruky programu |

**Automatické testy každé vestavěné položky:**

1. Spočítá se bez chyby se vstupy z příkladu, obě jazykové verze dají stejná čísla.
2. Sedí hodnoty z `checks`.
3. Vzorec jde přeskupit na každou veličinu a dosazení zpět souhlasí.
4. Vstup 0 a extrémní poměry nedají NaN ani pád, jen srozumitelnou chybu (nápad CalcSheetu).
5. Jména nekolidují s jednotkami tak, aby změnila význam. To pokrývá nález 1.12 z rozboru.
6. Všechny položky za sebou v jednom listu se navzájem nerozbijí.

## Normy a česká příloha

- **Pozor na CalcSheet:** jeho součinitele vycházejí z nizozemské přílohy (NEN-EN). Nepřebírat je.
- **Národně stanovené hodnoty** nedávat napevno. Položka má pole `national: true`, hodnota je vstup a u ní poznámka „ověřte podle národní přílohy ČSN EN“.
- **Text norem** nekopírovat, je chráněný. Vzorce a čísla článků ano, odkaz na článek stačí.
- **Kdo ověří:** české přílohy nemám k dispozici. Hodnoty musí potvrdit člověk s přístupem k normám. Do té doby zůstanou ve stavu „Spočítáno“.
- **Upozornění:** knihovna nenahrazuje posouzení odborníkem, stejně jako u CalcSheetu.

## Licence

| Zdroj | Co smíme |
|---|---|
| MathPrime (MIT) | Převzít seznam `formulas-en.txt` jako výchozí podklad, se zachováním upozornění |
| CalcSheet (LGPL) | Nápad a členění. Texty, kód ani obrázky ne, zápisy napsat vlastní |
| Vzorce z učebnic a norem | Vzorce jsou fakta, popisy a náčrty vlastní |

Tohle je praktické shrnutí, ne právní posudek.

## Etapy

**Etapa 1: základ a obecné vzorce.** Formát, načítání, dialog, přeskupení, vkládání, testy. Obsah: asi 80 až 100 vzorců z mechaniky, pružnosti, tekutin, termodynamiky, elektrotechniky a geometrie. Česky a anglicky.

**Etapa 2: vlastní vzorce.** „Uložit do knihovny…“, složky uživatele a firmy, vstup přes `/`.

**Etapa 3: úlohy a náčrty.** Nosníky a průřezy jako vícekrokové úlohy. Náčrty z plátna, které po zavedení řídicích kót sledují vstupy ([KRESBA-VAZANA-NA-VYPOCET.md](KRESBA-VAZANA-NA-VYPOCET.md)). Propojení s tabulkami (`pick`, `find_min`).

**Etapa 4: normy.** Eurokódy s českou přílohou, jen po lidském ověření hodnot.

**Závislosti:** před etapou 1 opravit nález 1.18 (otáčky a 2π) a 1.12 z [ZADANI-Z-KONKURENCE.md](ZADANI-Z-KONKURENCE.md). Výkon hřídele a vzorce `P = M·ω` jsou přímo v obsahu. Hlášení o neověřené hodnotě příkladu je nová drobnost v editoru.

## Otázky k rozhodnutí

1. ~~Dialog, ne panel?~~ **Rozhodnuto 2026-11-05:** samostatné okno z horního menu a oblíbené vzorce v nabídce pravého tlačítka.
2. ~~Úlohy jako text, ne blok?~~ **Rozhodnuto 2026-11-05:** jako text, vložený pod nadpis s pozicí.
3. ~~Příkladné hodnoty vstupů?~~ **Rozhodnuto 2026-11-07:** s varováním, dokud je uživatel nezmění.
4. ~~První obsah?~~ **Rozhodnuto 2026-11-07:** jen ze vzorů Kalkety (`reference/`), seznam MathPrime se zatím nepřebírá. Vzorce jsou tak ověřené na skutečných příkladech.
5. ~~Tisknout stav ověření?~~ **Rozhodnuto 2026-11-07:** ano, zdroj jako citace. Stav „Spočítáno“ v tisku jen na přání.

## Co ukázka nepokrývá

Měření ověřilo jen přeskupení na jádru. Dialog, formát, rozpoznání veličin v listu a odhad práce nejsou vyzkoušené. Klávesa Shift+F4 je jen návrh, obsazení jsem nekontroloval.
