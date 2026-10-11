# Kalketa — Architektura a plán realizace

**Verze:** 1.0 (návrh)
**Datum:** 2026-09-29
**Navazuje na:** [01-filozofie.md](01-filozofie.md)
**Rozhodnutí:** varianta A, tedy TypeScript pro jádro i UI

---

## 1. Technologie

| Oblast | Volba | Poznámka |
|---|---|---|
| Jazyk | **TypeScript** (strict) | jeden jazyk pro jádro, editor, CLI i budoucí server |
| Běhové prostředí | Node.js 24 LTS, prohlížeč | jádro poběží v obou beze změn |
| Balíčky | **npm workspaces** (monorepo) | bez dalších nástrojů navíc |
| Testy | **Vitest** | stejně jako ve stávajících verzích |
| UI | **React + Vite** | největší ekosystém a nejlepší podpora AI asistentů |
| Sazba vzorců | **MathML** (zobrazení i tisk), později **MathLive** (editace) | *Upraveno v F5:* místo KaTeX. MathML umí prohlížeče nativně, nepotřebuje fonty ani styly, je přístupné pro čtečky obrazovky a stejné řešení používá UzonCalc. |
| Tisk / PDF | HTML stránky s CSS `@page` → PDF přes Edge/Chrome v režimu bez okna | *Upraveno v F5:* Paged.js není potřeba, Chromium umí okraje, záhlaví a čísla stránek sám. Na Windows je Edge vždy k dispozici. |
| Soubor listu | ZIP kontejner (**fflate**) | viz kap. 4 |
| Import Excelu | **ExcelJS** | CSV vlastním parserem |
| Desktop | **Tauri** (případně Electron), až ve fázi F6 | Tauri vyžaduje nainstalovaný Rust toolchain, i když v Rustu nic nepíšeme. Do té doby běží aplikace v prohlížeči. |
| Verzování | **git** od prvního dne | |

**Čísla:** všude float64 (stejné jako Python i Rust). Zaokrouhlení řeší až tisková vrstva.

---

## 2. Struktura repozitáře

Nový čistý repozitář `kalketa/`. Stávající tři složky zůstanou beze změny jako archiv, kód se z nich přebírá jen s procházejícími testy (kap. 8).

```text
kalketa/
├── packages/
│   ├── core/            ← výpočetní jádro, ŽÁDNÉ závislosti na UI ani souborech
│   │   ├── lang/        lexer, parser, AST
│   │   ├── units/       dimenze, jednotky, posunuté jednotky, vlastní dimenze
│   │   ├── values/      Quantity, Complex, Series, Date, Text, Enum
│   │   ├── eval/        vyhodnocení výrazů, vestavěné funkce
│   │   ├── graph/       graf závislostí, inkrementální přepočet, cykly
│   │   ├── tables/      typované tabulky, pick, lookup + interpolace, hledání
│   │   ├── checks/      podmínky, využití, souhrn
│   │   ├── solver/      řešič rovnic (Brent, Newton)
│   │   ├── provenance/  dohledání hodnoty ke vzorci / řádku / zdroji
│   │   └── diagnostics/ jednotný systém chyb a varování
│   │
│   ├── sheet/           ← model listu a formát souboru
│   │   ├── model/       List, vrstvy, bloky, revize
│   │   ├── format/      čtení/zápis ZIP kontejneru, textový formát výpočtu
│   │   └── import/      CSV, Excel
│   │
│   ├── render/          ← převod výsledků na tiskovou podobu (HTML + KaTeX)
│   ├── canvas/          ← samostatný modul plátna (kresby v listu)
│   │   ├── src/         formát scény s verzí, SVG, úpravy (bez DOM a Reactu)
│   │   └── src/editor/  editor plátna v React (v listu i v okně), vlastní texty a styly
│   ├── chart/           ← samostatný modul grafů: čísla a popisky → SVG (bez DOM, jednotek a Reactu)
│   ├── editor/          ← React aplikace
│   ├── cli/             ← `kalketa run list.kalk`, `kalketa test`, export PDF
│   ├── i18n/            ← katalogy zpráv (cs, en, …), formát čísel podle jazyka
│   └── ai/              ← volitelný modul AI: smlouva, poskytovatelé, nastavení, firemní pravidla (ai/connect: volání poskytovatele)
│
├── reference/           ← referenční výpočty R1–R6 (listy + očekávané výsledky)
└── docs/                ← filozofie, architektura, návrh jazyka
```

### Pravidla závislostí (hlídat v lintu)

```text
editor ──► render ──► sheet ──► core
  cli ──────────────► sheet ──► core
   ai ──────────────► sheet ──► core
editor ──► canvas, canvas/editor   (jen tato dvě rozhraní)
  cli ──► canvas
render ──► chart ◄── editor        (graf jako SVG; editor jen čte rozvržení pro odečet hodnot)
```

**Modul plátna (`canvas`)** je samostatný: nepoužívá žádný jiný balíček projektu a jádro, list, tisk ani překlady o něm nevědí. Hlavní program ho zná jen přes úzké rozhraní:
- v listu je plátno obyčejný řádek obrázku `![…](canvases/<jméno>.json)`, v souboru je scéna jako JSON,
- `isCanvasPath`, `readScene`, `writeScene`, `emptyScene`, `sceneDataUri` (scéna → SVG pro editor i tisk z příkazové řádky),
- `<CanvasEditor>` z `@kalketa/canvas/editor`; vše, co od hostitele potřebuje (jazyk, dotaz na text, výběr souboru, prostor pro lištu, obrázky ze souboru), dostává přes vstupy.

Formát scény má číslo verze; `migrate` převádí starší scény na aktuální, prvky novější verze se jen nevykreslí. Pravidla hlídá `tests/architecture.test.ts`. Stejným vzorem mohou vzniknout další moduly (výkresy DXF).

**Modul grafů (`chart`)** vznikl stejným vzorem: nezná jádro, jednotky ani React. Jádro (`eval/plot.ts`) graf jen spočítá: navzorkuje výrazy a vrátí čísla v jednotkách os (`PlotResult`). Tisk z nich udělá popisky (jméno výrazu, „x [m]“) a zavolá `chartSvg`; editor si z bloku vezme rozvržení (`chartLayout`) a pod myší odečítá hodnoty. Graf je v listu obyčejný řádek `plot(…)`, takže se přepočítá s výpočtem jako každý jiný řádek.

**Modul AI (`ai`)** je celý vyměnitelný (filozofie, kap. 9.1): nepoužívá jiné balíčky projektu ani React a jádro, list, tisk ani překlady o něm nevědí.
- `@kalketa/ai`: verzovaná smlouva (`AI_CONTRACT_VERSION`, úloha → návrhy), seznam poskytovatelů, nastavení (poskytovatel, model; ve výchozím stavu vypnuto) a firemní pravidla (`AiPolicy`, mají přednost před nastavením). Bez sítě, používá ho editor.
- `@kalketa/ai/connect`: volání poskytovatele. Claude přes oficiální SDK (`@anthropic-ai/sdk`), lokální servery (LM Studio, Ollama, jiný server na zadané adrese, např. llama.cpp) přes jejich rozhraní ve stylu OpenAI (`/v1/models`), bez klíče. Program běžící lokální servery najde sám. Běží jen v hlavním procesu desktopové aplikace; editor ho importovat nesmí.
- API klíče drží jen hlavní proces (`packages/desktop/src/ai.ts`): zapamatovaný klíč je zašifrovaný systémem (Electron `safeStorage`), editor ho může nastavit nebo smazat, nikdy ho nedostane zpět. Firemní pravidla čte desktop z `ai-policy.json` vedle programu.
- **Rozhovor s AI** je režim bočního panelu (Zobrazení → Boční panel → Rozhovor s AI). Editor sestaví, co model vidí (`logic/aiContext.ts`: text listu s čísly řádků, chyby, posudky a výsledky anglicky, přehled funkcí z jádra). Instruktáž (`briefing`, anglicky, odpovědi v jazyce uživatele) skládá hlavní proces a přidává firemní pravidla, aby je editor nemohl vynechat. Odpověď přichází po kouscích (`chat` v `ai/connect`). Rozhovory se ukládají do vrstvy Poznámky AI jako `layers/<ai>/conversations.json` (`sheet/conversations.ts`): otázky, odpovědi, model, čas a které úseky teorie model dostal. Netisknou se, vrstva AI s nimi vznikne a zůstane; ve vrstvě je lze číst, smazat nebo v nich pokračovat. Starší verze programu záznam ponechá beze změny. Návrhy změn v odpovědi (bloky `change`) čte `ai/proposals.ts`; editor je zapíše do deníku `layers/<ai>/entries.json` (`entriesOf`/`withEntries`), dopad spočítá `logic/proposalEffect.ts` vyhodnocením listu se změnou a kartu kreslí `components/ProposalCard.tsx` (v chatu i ve vrstvě AI). Přijaté a neprověřené řádky najde `aiMadeLines` (podle textu řádků, nejblíž místu přijetí) a `SheetView` je označí značkou AI s menu Prověřeno. V tisku je označí `printHtml` (volba `aiLines`, upozornění nahoře) a vrstvu AI jako přílohu skládá `logic/aiProtocol.ts`.
- Smoke test zkouší nastavení AI proti falešnému API (`scripts/smoke.mjs`), bez internetu a skutečného klíče.
- API klíč se na disk uloží jen tehdy, když ho systém skutečně zašifruje (`canSealKeys`). Na Linuxu bez úložiště hesel (keyring) Electron „šifruje“ pevným heslem (`basic_text`); to se za šifrování nepočítá a klíč platí jen do zavření programu.

**Linux.** `npm run smoke:linux` (z Windows, přes WSL Ubuntu) zkopíruje pracovní stav projektu do linuxové složky (`~/kalketa`) a pustí tam typecheck, jednotkové testy a smoke test se skutečným vstupem na virtuálním displeji (`xvfb`); s `-- --appimage` sestaví a otestuje i AppImage a balíček `.deb` (rozbalený, bez instalace) a zkopíruje je do `packages/desktop/release`. Ubuntu od 23.10 (AppArmor) zakazuje sandboxu Chromia jmenné prostory uživatelů; AppImage si proto při `apparmor_restrict_unprivileged_userns = 1` zapne `--no-sandbox` sám, `.deb` sandbox ponechá (instaluje k němu setuid pomocníka). AppImage na Ubuntu 22.04+ potřebuje `libfuse2` (24.04+: `libfuse2t64`), `.deb` ne. Node 24 je v Ubuntu rozbalený v `~/.local/node` (`scripts/linux-env.sh`). Smoke test proto nesmí spoléhat na pixely, které závisí na písmech (na Linuxu DejaVu místo Segoe UI): cíle tažení a kliknutí měří od skutečných prvků stránky.

- **core nezávisí na ničem** z projektu, nesahá na soubory ani síť a je deterministický.
- **core nezná žádný obor.** Kód pro konkrétní obor (IPE, kabely, NPV…) patří do tabulek a bloků v `reference/` nebo do knihoven, ne do `core`.
- **ai** jen čte list a vrací návrhy. Nikdy nemění výpočet přímo.

---

## 3. Jazyk výpočtu (textová podoba)

Uvnitř listu je výpočet uložený jako čitelný text. Editor ho zobrazuje jako sázené vzorce a tisková vrstva jako klasický technický výpočet. Předběžná ukázka pro R1, přesnou syntaxi určí samostatný dokument `03-jazyk.md`:

```text
# Posouzení nosníku N1

## Zadání
L := 5 m                          ' rozpětí
q := 12 kN/m                      ' spojité zatížení
material := pick(Materialy, "S235")
profil   := pick(Profily_IPE, "IPE 200")

## Výpočet
M_Ed := q·L²/8
σ    := M_Ed / profil.Wy
w    := 5·q·L⁴ / (384·material.E·profil.Iy)

## Posouzení
check "Ohyb":   σ ≤ material.fy        source "EN 1993-1-1, 6.2.5"
check "Průhyb": w ≤ L/250              source "EN 1990, A1.4"

## Návrh
profil_min := find_min(Profily_IPE, by: G, where: σ ≤ material.fy)
```

Zásady jazyka:

- `:=` je definice, `=` je v tisku zobrazení výsledku, `==` je rovnice pro řešič.
- Jednotky se píšou přímo (`12 kN/m`). Nejednoznačnost (`m` jako metr vs. proměnná) se hlásí, nikdy se tiše nehádá.
- Unicode i ASCII zápis jsou rovnocenné (`σ` / `sigma`, `·` / `*`, `²` / `^2`).
- Tabulky a jejich sloupce jsou běžné hodnoty (`profil.Wy`).

---

## 4. Formát souboru listu

Přípona `.kalk` (soubory z doby před přejmenováním mají `.calc` a otevírají se stejně), obsahem je ZIP kontejner:

```text
nosnik-N1.kalk
├── manifest.json          verze formátu, název, autor, revize, otisk obsahu
├── sheet.cc               výpočet v textovém jazyce (kap. 3)
├── layout.json            tisková vrstva: stránky, pořadí, formát čísel
├── workspace.json         pracovní vrstva: varianty, poznámky, pozice
├── tables/
│   └── Profily_IPE/
│       ├── schema.json    sloupce, typy, jednotky, zdroj, datum převzetí
│       └── data.csv       data
├── images/                obrázky k řádkům tabulek a do tisku
├── ai/                    poznámky a přijaté návrhy LLM (volitelné)
└── revisions/             zmrazené revize (A, B, C …)
```

- Vše uvnitř je v otevřených formátech (JSON, CSV, text, PNG/SVG). Obsah jde přečíst i bez programu.
- `sheet.cc` a `data.csv` jsou text, takže je jde porovnávat mezi revizemi a verzovat v gitu.
- `manifest.json` obsahuje **verzi formátu** od první verze, aby šly starší listy vždy načíst.

**Upřesněno při implementaci F4:**

- `manifest.json`: `format: "kalketa-sheet"`, `formatVersion`, název, jazyk tisku, autor, datum vytvoření a změny, program, který soubor zapsal, a **otisk obsahu** (SHA-256 všech ostatních položek). Když se obsah změní mimo program, při otevření se zobrazí varování (`W-FILE-HASH`).
- Soubor z **novější verze formátu** se odmítne s jasnou zprávou (`E-FILE-VERSION`), nikdy se nečte napůl.
- **Neznámé položky se zachovají** (např. data z budoucí verze nebo vrstva AI), takže je starší program při uložení nesmaže.
- Stejný obsah dává **stejné bajty** (pevné pořadí a časová značka položek). Hodí se pro porovnávání a git.
- Cesty uvnitř archivu se kontrolují (žádné `..`, absolutní cesty ani zpětná lomítka), aby rozbalení nemohlo zapisovat mimo cílovou složku.
- Příkazová řádka: `pack` (složka → `.kalk`), `unpack` (`.kalk` → složka), `run` a `trace` čtou obojí.

---

## 5. Tok dat

```text
sheet.cc ──► lexer ──► parser ──► AST ──► graf závislostí
                                              │
tabulky (tables/) ────────────────────────────┤
                                              ▼
                                   vyhodnocení (core/eval)
                                              │
                          ┌───────────────────┼──────────────────┐
                          ▼                   ▼                  ▼
                    výsledky            diagnostika         provenance
                          │                   │                  │
                          └──────────► render (tisk) ◄───────────┘
                                              │
                                     editor / PDF / CLI
```

- Po změně vstupu se přepočítají jen závislé uzly (inkrementální přepočet).
- **Veřejné API jádra je jedna čistá funkce:** `evaluate(sheet, tables) → { results, diagnostics, provenance }`. Stejné volání používá editor, CLI, testy i budoucí server.

---

## 6. Editor (první verze)

Plný WYSIWYG editor vzorců jako v Mathcadu je nejdražší část projektu, proto postupně:

1. **Blokový editor.** Stránka je seřazený seznam bloků: nadpis, text, vzorec, výběr z tabulky, podmínka, obrázek, tabulka.
2. **Vzorec** se zobrazuje sázený (KaTeX). Po kliknutí se edituje jako řádek textu, po opuštění se znovu vysází.
3. **Výběr z tabulky** je rozbalovací seznam s náhledem obrázku. V tisku se zobrazí jen zvolená hodnota.
4. **Tabulkový editor** pro typované tabulky (sloupce s jednotkami, obrázky k řádkům, import z Excelu a CSV).
5. **Klik na hodnotu** otevře panel s provenance (vzorec → vstupy → řádek tabulky → zdroj).
6. Později MathLive pro přímou editaci sázených vzorců a volné plátno v pracovní vrstvě.

---

## 7. Testovací strategie

| Úroveň | Co | Kde |
|---|---|---|
| Jednotkové testy | každý modul jádra samostatně | `packages/*/tests` |
| **Referenční výpočty R1–R6** | celé listy a jejich očekávané výsledky s tolerancí | `reference/` |
| Chybové a hraniční případy | seznam z filozofie, kap. 10.1 | `reference/errors/` |
| Round-trip | uložit → načíst → stejný výsledek, u každého referenčního listu | automaticky |
| Nezávislost na oboru | `core` nesmí obsahovat názvy z oborů (kontrola lintem/testem) | CI |

- **Očekávané výsledky** referenčních výpočtů se ověří nezávisle (ručním výpočtem, tabulkami, jiným programem) a uloží se k listu.
- `npm test` spouští všechno a **žádná fáze není hotová, dokud testy neprocházejí**.
- Status dokumenty se nepíšou ručně. Stav je to, co ukazují testy.

---

## 8. Co převzít ze stávajících verzí

Kód se přebírá **po kouscích, vždy i s testy**. Co neprojde, se nepřebírá.

| Zdroj | Co | Stav |
|---|---|---|
| `calc-canvas_01` | lexer, expression parser (implicitní násobení), dimenze, Quantity, graf a reaktivní přepočet | funguje, 47/47 testů |
| `calc-canvas` | posunuté jednotky (°C, °F), parser jednotek, registr jednotek, detekce implicitních parametrů | nápad dobrý, kód nekompiluje (34 chyb) → opravit, nebo přepsat podle testů |
| `calc-canvas_02` | návrh modelu Project/Page/Block a chybových kódů (CC-012) | jen jako inspirace (Python) |
| `Konkurence/` | CalcpadCE: pravoasociativní `^`, zápis cílové jednotky; EPX: detekce implicitních parametrů; postgresql-unit: posunuté jednotky | inspirace |

---

## 9. Plán realizace

Každá fáze končí procházejícími testy. **MVP = referenční výpočet R1 projde od souboru až po PDF.**

### Cesta k MVP (R1 — nosník)

| Fáze | Obsah | Hotovo, když |
|---|---|---|
| **F0 Základ** | git, monorepo, Vitest, lint, pravidla závislostí | `npm test` projde na prázdném projektu |
| **F1 Jádro** | lexer, parser, jednotky (převzato z v0.1 + °C), vyhodnocení, graf, diagnostika | výpočet R1 bez tabulek projde přes CLI |
| **F2 Tabulky** | typované tabulky, CSV/Excel import, `pick`, `lookup` s interpolací, `find_min` | R1 s tabulkami profilů a materiálů projde přes CLI |
| **F3 Podmínky + provenance** | `check`, využití, souhrn, dohledání hodnoty | R1 vypíše souhrn posudků a původ každé hodnoty |
| **F4 Formát listu** | ZIP kontejner, uložení/načtení, verze formátu | round-trip R1 |
| **F5 Tisk** | render do HTML stránek, KaTeX, formát čísel, PDF | R1 se vytiskne jako klasický výpočet |
| **F6 Editor** | blokový editor, výběr z tabulky s obrázkem, tabulkový editor, panel provenance, desktop | R1 jde celý vytvořit v editoru |

### Rozšíření jádra (další referenční výpočty)

| Fáze | Referenční výpočet | Nové schopnosti jádra |
|---|---|---|
| F7 ✓ | R2 strojař | vložené bloky se vstupy/výstupy, uživatelské funkce |
| F8 ✓ | R3 chemik | vlastní dimenze, řešič rovnic |
| F9 ✓ | R4 elektrikář | komplexní čísla, 2D interpolace |
| F10 ✓ | R5 ekonom | měna a kurz k datu, řady, data a období, finanční funkce |
| F11 (možný dodělek) | R6 průřezový ✓ | více tabulek v jednom listu ✓; varianty odloženy, viz níže |

*F11, varianty (rozhodnuto 30. 9. 2026):* zatím se řeší kopiemi souboru (Uložit jako), otevřenými v záložkách nebo ve dvou oknech. Kdyby chyběl přehled, dodělá se **Okno → Porovnat otevřené výpočty**: srovnávací tabulka stejně pojmenovaných výsledků a posudků z otevřených záložek, bez změny formátu souboru. Použije stejné porovnání výsledků jako revize (kap. 7 filozofie). Varianty v jednom souboru (vrstva s tabulkou vstupů `input`) zůstávají možností, pokud by kopie nestačily.

### Potom

- revize a porovnání revizí, PDF s otiskem,
- vrstva AI (převod katalogů do tabulek, kontrola výpočtu),
- Python jako jazyk pro zásuvné moduly,
- serverová databáze a sdílené knihovny tabulek.

### Možná (nápady odložené, zatím beze změny)

- **Plátno – dokončení** (1. 10. 2026, odloženo; první verze stačí). Vše v modulu `canvas`, rozhraní k hlavnímu programu se rozšíří jen tam, kde je to uvedeno:
  - **živé hodnoty z výpočtu** v textu plátna (`{L}` → „5 m“, mění se se zadáním); rozhraní: hostitel předá funkci „jméno → hotový text“, plátno nezávisí na jádru,
  - ~~**kóty**~~ **hotovo 2026-10-11:** nástroj Kóta (D) mezi dvěma body s pomocnými čarami, šipkami a popiskem (ptá se hned po nakreslení, dvojklik ho změní), táhlo uprostřed posune kótu od bodů; zbývá živá hodnota (`{L}`) a styly kót (čárka místo šipky),
  - výběr více prvků (obdélníkem a Shiftem), posun a mazání skupiny, seskupení,
  - zarovnání a rozmístění (vlevo, na střed, rovnoměrně), přichytávání k prvkům,
  - víceřádkový text psaný přímo do kresby místo dialogu, tučné písmo, zarovnání textu,
  - otočení prvků, ořez obrázku, průhlednost,
  - další tvary: mnohoúhelník, křivka; knihovny značek (klouby v prutu, osamělé síly s popiskem, elektrické značky). **Hotovo 2026-10-11:** značky mechaniky: podpora kloubová (P) a posuvná (K) a vetknutí (F) kliknutím na bod, roh mění velikost, tlačítko ⟳ otočí o 90°; spojité zatížení (Q) tažením podél prutu, šipky po 3 mm k prutu, popisek (q), táhlo uprostřed mění délku šipek; oblouk (O, čtvrtkruh od středu ke kraji) a moment (M, tři čtvrtiny se šipkou), táhla začátku (s poloměrem) a konce; šrafy obdélníku a elipsy (přepínač Šrafy, čáry 45° po 1,5 mm v barvě obrysu),
  - kopírování a vkládání prvků (i mezi plátny), export plátna jako SVG nebo PNG.
- **Další vkládané prvky mimo výpočet** (1. 10. 2026), každý jako samostatný modul stejným vzorem jako plátno:
  - ~~**graf** funkce nebo řady z výpočtu či tabulky~~ – první verze hotová (1. 10. 2026, kap. 7.1e jazyka),
  - **tabulka do tisku** (přehled hodnot z výpočtu nebo výřez z databázové vrstvy),
  - **rámeček** (předpoklad, upozornění, citace normy),
  - **vzorec jen k zobrazení** (normový vztah bez výpočtu),
  - **výřez z PDF** (kus stránky normy nebo katalogu jako obrázek s odkazem na zdroj),
  - **výkres DXF** (import 2D výkresu z CAD jako vektor),
  - **rohové razítko, revize a podpisy**, **obsah a seznam obrázků**, **QR kód s otiskem revize**.
- **Grafy – další vývoj** (1. 10. 2026; první verze „klasika“ hotová a jako základní graf zůstává, kap. 7.1e jazyka).
  **Rozhodnuto 1. 10. 2026:** žádné druhé plátno jen pro grafy. Lepší grafy ve dvou rovinách:
  1. **Samostatný graf zůstává v modulu `chart`** a je dál řádkem `plot(…)` ve výpočtu (text, dohledatelný, vždy živý). Vylepšení: místní nabídka po kliknutí na graf jako u obrázku (popis os, rozsah os, druh, vyznačení extrémů jako M_max = 54 kN·m v x = 3 m, hodnoty v bodech, šrafovaná plocha pod křivkou – obrazec momentů), umístění jako u obrázku (šířka tažením za roh, vedle textu, obtékání). Nastavení se zapisuje do řádku `plot(…)` jako volby.
  2. **Složené obrázky na stávajícím plátně:** plátno dostane prvek **graf** (odkaz na řádek `plot(…)` listu). Plátno graf nepočítá, nakreslí ho hostitel (stejně jako živé hodnoty `{L}`), takže plátno dál nezávisí na jádru. Graf jde přichytit k ose nosníku: průběh M, V a průhybu pod schématem nosníku se skutečnými podporami a zatížením (prostý nosník, konzola, spojitý nosník) se s kresbou vždy kryje.
  Proč ne samostatné plátno pro grafy: zdvojil by se výběr, posun, mřížka, texty, zpět/znovu i ukládání a časem by se rozcházely; uživatel by musel předem volit mezi dvěma plátny; moment pod nosníkem stejně potřebuje kresbu i graf v jednom obrázku.
  **Pořadí:** (1) místní nabídka grafu, umístění jako obrázek, vyznačení extrémů; (2) knihovna značek na plátně (podpory, klouby, vetknutí, síly, spojité zatížení); (3) prvek graf na plátně přichycený k ose nosníku.
  Později: další druhy (malé násobky místo druhé osy y, logaritmické osy, parametrický graf x(t), y(t), vrstevnice a mapa barev pro funkci dvou proměnných, interakční diagram N–M), graf přímo z tabulky (Vložit → Graf nad vybranými sloupci), tabulka hodnot ke grafu do tisku.
- **Stránky vedle sebe podle zoomu** (30. 9. 2026). Dnes se stránky zalamují podle šířky panelu a tlačítka 1/2/3 stránky dopočítají zoom, aby se vešlo N stránek. Možná úprava: hlavním ovládáním je zoom a počet stránek z něj vyplyne, tlačítka 1/2/3 zůstanou jako „přizpůsobit na N stránek“. Pravidlo: po „přizpůsobit“ se drží počet stránek a zoom se dopočítá, po ruční změně zoomu se drží zoom. K tomu patří:
  - ukotvení na aktivní řádek při přeskládání, aby řádek po otevření bočního panelu nebo vrstvy vedle neuskočil,
  - malá tolerance na hranici šířky, aby nepřeskakoval počet sloupců,
  - vlastní zoom pro každý panel vrstev vedle sebe,
  - při velmi malém zoomu (pod asi 40 %) klik stránku nejdřív přiblíží.
- **Výběr stylu výpočtu** (30. 9. 2026, řešit později, zatím nepodstatné). Dnešní vzhled listu plýtvá místem. Zůstane jako jeden ze stylů, třeba „Vzdušný“. Přibude úsporný styl a výběr stylu ve Vlastnostech výpočtu, uložený v souboru. Rozhodnuto s uživatelem:
  - **ano:** výsledek na stejném řádku jako vzorec, `A = π·d²/4 = π·(20 mm)²/4 = 314,2 mm²`, a zalomit, když se řádek nevejde,
  - **ano:** víc zadání (`L := 6 m`) na jeden řádek,
  - **ne:** vzorce se nezjednodušují ani u jednoduchých výpočtů; dosazení zůstává vždy (kontrolovatelnost),
  - **mezery mezi řádky a pod nadpisy:** součást stylu, nebo nastavitelné přímo v editoru písma a odstavců,
  - **okraje a patička:** patří do Nastavení stránky, ne do stylu.

  Styl mění jen sazbu, nikdy výpočet. Tisk a PDF použijí styl uložený v souboru, takže stejný soubor vypadá všude stejně.

  *Hotovo 2026-10-05 (školní / úsporný styl):* `layout.style` v souboru (`compact` | `airy`). Nový výpočet je `compact`, soubor bez stylu zůstane `airy`, jak byl vytvořen. Volba je ve Vlastnostech výpočtu. `render` (`renderBlockHtml`, `renderBlocksHtml`, volba `style`) skládá kroky na jeden řádek (`.eq-flow`, zalomení na rovnítku pod první) a zadání vedle sebe (`.flow-group`, `isInput`). Posudek a výběr z tabulky jsou také na jednom řádku. Editor (`SheetView`, `calcStyle`) ukazuje totéž, každé zadání zůstává řádkem k úpravě. Knižní styl a styl se sloupci jsou rozhodnuté v `navrhy/RESIC-A-STYLY.md`, zatím nenaprogramované.

---

## 10. Jazyk kódu a lokalizace

- Kód, komentáře, názvy a klíčová slova jazyka výpočtu jsou **anglicky**.
- Uživatel si v nastavení zvolí jazyk programu. **Jádro nikdy nevrací hotový text** (jen kódy a parametry), texty dodává balíček `i18n`. Podrobnosti v [03-jazyk.md](03-jazyk.md), kap. 15.

## 11. Otevřená rozhodnutí

1. **Přesná syntaxe jazyka.** Samostatný dokument `03-jazyk.md` před fází F1.
2. **Tauri, nebo Electron** pro desktop. Rozhodnout ve fázi F6 (Tauri potřebuje Rust toolchain, Electron je větší, ale bez něj).
3. **Očekávané výsledky R1–R6.** Kdo a jak je nezávisle ověří (ideálně odborník z daného oboru).
4. **Umístění repozitáře a zálohování** (GitHub/GitLab, soukromé, nebo jen lokální git).

### Studijní podklady (2026-10-04)

PDF, HTML a Markdown ve složkách teorie čte hlavní proces (`desktop/src/study.ts`). U PDF jde přes pdf.js (`pdfjs-dist`, legacy build v Node) o text stránek, tištěná čísla stran a obsah. Text PDF se ukládá do mezipaměti `userData/study-cache` podle cesty, velikosti a času souboru. Nativní `@napi-rs/canvas`, nepovinnou závislost pdf.js, program nepotřebuje: do instalace se nebalí a není ani v seznamu licencí. Desktop nezávisí na `@kalketa/sheet`: posílá surový obsah a popis souboru, kapitoly a úseky z nich skládá `sheet/studyFile.ts` (`studyContent`, `studyLibrary`, `selectedPages`, `studyAdvice`). Výsledek je běžná `TheoryLibrary`, takže hledání, citace i kopie citovaných úseků fungují jako u `.kalkt`. Dialog výběru je `editor/src/components/StudyDialog.tsx`.

Výřez z PDF (`editor/src/components/PdfCropDialog.tsx`) kreslí stránky přes pdf.js přímo v editoru. Bajty souboru dává kanál `kalketa:study-bytes`, worker se načítá jako soubor sestavení (`?url`). Výřez se kreslí v režimu tisku (`intent: 'print'`): režim obrazovky čeká na snímky okna, které okno na pozadí nedostává. Zásady obsahu editoru povolují písma z `data:` a `blob:`, pdf.js jimi kreslí písma vložená v PDF.
