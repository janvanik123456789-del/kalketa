# Kalketa — Filozofie programu

**Verze:** 2.0 (návrh)
**Datum:** 2026-09-29
**Stav:** Návrh k diskusi. Nahrazuje `calc-canvas/01-philosophy.md`. Upraveno 2026-09-30: libovolný počet vrstev (kap. 4). Upraveno 2026-10-02: připojení LLM, průvodce pro model, okno rozhovoru, obrázky, prezentace a web (kap. 9.1–9.5, 11). Upraveno 2026-10-03: teorie k výpočtu, knihovna `.kalkt` a RAG, vrstva Poznámky AI (kap. 4, 9.6, 9.7). Upraveno 2026-10-04: uspořádání vrstvy AI, paměť, návrhy změn (kap. 9.7).

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

*Upřesněno 2026-09-30:* počet vrstev není pevný. Nový list má **dvě výchozí vrstvy** a uživatel si **libovolně přidává další**.

*Upřesněno 2026-10-01:* **Poznámky AI vznikají až s připojenou AI**, ve chvíli, kdy do nich AI poprvé něco zapíše. Bez AI je list nemá; prázdné Poznámky AI ze starších souborů se při otevření vynechají. List má nejvýš jednu vrstvu AI. Člověk text AI nepřepisuje, ale smí smazat záznamy i celou vrstvu (kap. 9.7, upřesněno 2026-10-03).

```text
List "Nosník N1"
├── 1  List (tisk)         výpočet: stránkový dokument (A4), konečný počet stran,
│                          čte se shora dolů, podepisuje se          [výchozí]
├── 2  Databáze            data: tabulky s obrázky k řádkům, zdroje  [výchozí]
├── 3  Zatížení            pomocný výpočet, list z něj bere hodnoty  [přidaná]
├── 4  Teorie              podklady: výtahy, obrázky, citace, odkazy [přidaná]
└── 5  Poznámky AI         návrhy a kontroly LLM, nikdy nemění výpočet [s připojenou AI]
```

**Druhy vrstev:**

| Druh | Obsah |
|---|---|
| **Výpočet** | řádky výpočtu. Hlavní je „List (tisk)“, další jsou pomocné výpočty a varianty. |
| **Data** | typované tabulky s obrázky k řádkům (kap. 5). Vrstev s daty může být více (katalog, měření…). |
| **Poznámky AI** | návrhy a kontroly LLM (kap. 9); vrstvu založí až připojená AI; člověk text nepřepisuje, smí ho smazat (kap. 9.7). |
| **Podklady** | teorie, zadání, odůvodnění: text, vybrané obrázky, citace a odkazy (kap. 4.2). |
| **Externí výpočet** *(později)* | skript v Pythonu nebo výsledky z jiného programu (FEM, Excel) převzaté jako tabulka s údajem o původu (kap. 4.1). |

**Vlastnosti každé vrstvy:** název, pořadí, zobrazit/skrýt, **zamknout** proti nechtěné změně (vhodné pro převzatá data) a **tisknout jako přílohu** ano/ne.

- **Tisková vrstva je stránková**, stejně jako v Mathcadu. Má konečný počet stran.
- **Ostatní vrstvy nejsou omezené.** Mají místo i pro volné plátno.
- **Tiskne se vždy List (tisk).** Ostatní vrstvy jen tehdy, když je uživatel označí jako přílohu, a vždy až za listem jako „Příloha A, B…“.

### 4.1 Pomocné výpočty

Hlavní list smí používat výsledky pomocných výpočetních vrstev. Hodí se to hlavně tam, kde hlavní program **něco neumí nebo nepočítá dost přesně**, případně když by rozsáhlý mezivýpočet zbytečně zahltil hlavní list.

- Hodnota převzatá z pomocné vrstvy nese v tisku **odkaz na svůj původ** (`q = 12,5 kN/m ← Příloha A: Zatížení`).
- Pomocná vrstva, ze které tisknutý list čerpá, se **automaticky tiskne jako příloha**. Kontrolor musí vidět celý postup.
- Pomocný výpočet v jiném nástroji (Python, jiný program) musí být **reprodukovatelný**. Uloží se skript nebo vstupní soubor, verze nástroje a výsledek. Program vždy označí hodnotu jako „vypočteno externě“.
- Dohledání původu (kap. 3, princip 4) prochází i přes pomocné vrstvy.

### 4.2 Podklady: výtahy, ne celé dokumenty

Do vrstvy Podklady se **nevkládají celé PDF**. Soubor by zbytečně narostl, u skenu by text stejně nešel použít a u norem by šlo o šíření chráněného díla.

Vrstva obsahuje:
- **výtah:** text vložený nebo přepsaný uživatelem. Převod skenu (OCR) nebo zpracování přes LLM přijde později a jeho výsledek se sem uloží jako text,
- **vybrané obrázky:** výřez grafu, tabulky nebo schématu, ne celá stránka,
- **citaci:** název, vydání, strana, článek,
- **odkaz na originál:** cestu k souboru nebo webovou adresu, bez vložení samotného souboru.

### 4.3 Velikost souboru

Soubor výpočtu může obsahovat tabulky a obrázky v řádu MB. Když překročí rozumnou mez (výchozí 50 MB, lze změnit v nastavení), program **upozorní**, které vrstvy a soubory zabírají nejvíc místa.

### 4.4 Další vlastnosti vrstev

- **Z tisku jde prokliknout do hloubky:** kliknutí na `Wy = 194 cm³` ukáže řádek tabulky, ze kterého hodnota pochází, obrázek a zdroj.
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
  *Upřesněno 30. 9. 2026:* zatím se varianty řeší kopiemi souboru (Uložit jako) v záložkách nebo oknech vedle sebe; porovnání otevřených výpočtů je možný dodělek (F11), postavený na stejném porovnání jako revize.
- **Export do PDF s otiskem (hashem):** z vytištěného výpočtu jde ověřit, kterou revizi listu představuje.

*Hotovo 1. 10. 2026 (Soubor → Revize…):*
- **Zmrazení:** revize A, B, … (nebo vlastní označení, např. P1) s poznámkou a autorem. Revize je úplný snímek obsahu (výpočet, vrstvy, tabulky, bloky, obrázky) uložený přímo v souboru `.kalk` ve složce `revisions/<označení>/`. Výpočet jde dál upravovat; zmrazený obsah se nemění.
- **Otisk:** SHA-256 celého obsahu, v tisku a v PDF vlevo dole na každé stránce: „Revize A (1. 10. 2026) · otisk 3f9c 21ab“, po změnách „Rozpracováno po revizi A · otisk …“, bez revizí jen „Otisk …“. Stavový řádek ukazuje „Revize A“ nebo „Revize A + změny“.
- **Ověření:** otisk z papíru (stačí 8 znaků) se zadá do dialogu a program řekne, které revizi patří, nebo že nepatří žádné. Revize změněná mimo program se při otevření ohlásí (`W-REVISION-HASH`).
- **Porovnání:** libovolné dvě revize nebo revize s aktuálním obsahem: změněné zadání a vzorce (zápis před → po), změněné výsledky (hodnota před → po a změna v %), posudky (využití a ✓/✗) a tabulky. Jiná jednotka zobrazení ani jiné mezery se za změnu nepočítají.
- **Otevřít** revizi: otevře se jako nový výpočet v záložce (např. pro tisk staré revize nebo pro porovnání vedle sebe).
- Příkazová řádka (`kalketa print`) tiskne stejnou patičku; `unpack`/`pack` revize zachová.
- Možné doplňky: tisk porovnání jako protokol změn, porovnání otevřených výpočtů (F11) stejným mechanismem, podpis revize, QR kód s otiskem.

---

## 8. Soubor listu

- List je **jeden soubor-kontejner** (ZIP, stejně jako `.docx`), který obsahuje výpočet, tabulky, obrázky a metadata.
- **Výpočet uvnitř je čitelný text:** jde porovnávat verze, verzovat v gitu a snadno s ním pracuje i LLM.
- Tabulky jsou uvnitř v otevřeném formátu (CSV nebo podobném), aby šly otevřít i bez programu.
- Seznam vrstev (druh, název, pořadí, viditelnost, zámek, příloha, tabulky datové vrstvy) je v `layers.json`. Každá vrstva má vlastní složku `layers/<id>/`: pomocný výpočet má `sheet.cc`, podklady a poznámky AI mají `notes.md` a výřezy obrázků v `images/`. Tištěný List zůstává v `sheet.cc` a tabulky v `tables/`. Soubory bez seznamu (formát verze 1) se otevřou se třemi výchozími vrstvami.

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

### 9.1 Připojení LLM (upřesněno 2026-10-02)

- **Samostatný, snadno vyměnitelný modul.** Nikdo neví, jak budou LLM vypadat za rok. Program proto zná jen malou, verzovanou smlouvu: dovnitř jde druh úlohy (zkontrolovat, vysvětlit, navrhnout, převést tabulku) a kontext listu, ven jdou návrhy (poznámka, změna, tabulka). Poskytovatelé, modely, přihlašování, tvar API i pokyny pro model jsou v modulu. V programu zůstává kontrola návrhu jádrem a schválení člověkem.
- **Výběr poskytovatele a modelu je od začátku**, i když zpočátku nabízí jen Claude. Inspirací je rozšíření Cline pro VS Code: výběr poskytovatele a modelu, schopnosti modelu (kontext, obrázky, strukturovaný výstup), rozdíl s Přijmout / Odmítnout, spotřeba a cena. Nepřebíráme autonomní smyčku agenta ani automatické schvalování změn výpočtu.
- **Nastavení patří programu, ne listu.** Poskytovatel, model a klíče jsou v hlavním nastavení programu a klíče si program může zapamatovat (šifrovaně, s možností nepamatovat). List si u přijatého návrhu uloží jen model a datum.
- **Lokální LLM jednoduše.** Program sám najde běžící lokální server (např. Ollama, LM Studio) a nabídne jeho modely. Pole pro klíč se zobrazí jen tam, kde je potřeba.
- **Firemní pravidla jsou samostatný modul**, který si správce upraví podle sebe: povolení poskytovatelé, firemní server, vypnuté funkce, společné pokyny (např. „Eurokódy s českou NA“). Mají přednost před nastavením uživatele. Díky otevřenému kódu si podnik nebo instituce může modul i program dále upravit.
- **Pod kapotou angličtina.** Pokyny pro model i poznámky AI jsou anglicky. Překlad si uživatel vyžádá, když ho potřebuje. Citace norem a zdrojů zůstávají v originále.
- **Později:** Kalketa jako nástroj pro externí LLM (MCP, CLI). Zajímavé hlavně pro lokální modely, protože velké modely už počítají přes spouštění kódu a jazyk listu jim dá jednotky, tabulky a dohledatelnost.

### 9.2 Průvodce pro model: instruktáž, nástroje, postupy

Model se v programu pohybuje jen tam, kam ho program pustí. Průvodce má tři vrstvy:

1. **Instruktáž** (systémový prompt): co je list, vrstvy, posudek a provenance; pravidla (výpočet jen navrhuj, cituj zdroje, piš anglicky); stručný přehled jazyka listu. Přehled jazyka se **generuje z programu** (seznam funkcí, nápověda F1, významy chybových kódů), aby nikdy nezastaral.
2. **Nástroje** jsou hranice oprávnění. Model nevidí disk ani soubory, jen nástroje, které mu program nabídne. **Co nemá nástroj, to nemůže udělat.**

   | Kam | Co smí |
   |---|---|
   | List a pomocné výpočty | číst hodnoty a trasování, **navrhnout** změnu |
   | Data (tabulky) | číst schéma a vybrané řádky, **navrhnout** tabulku |
   | Podklady | číst výtahy |
   | Chyby a posudky, nápověda jazyka | číst |
   | Poznámky AI | **zapisovat** přímo |
   | Disk, síť, jiné soubory | nic |

3. **Postupy úloh:** krátký návod pro každou úlohu (např. „zkontrolovat list“: chyby a posudky → chybějící posudky a neobvyklé hodnoty → trasování podezřelých → poznámky s odkazem na řádek). Postupy jsou v modulu AI a firemní pravidla k nim mohou přidat vlastní pokyny.

Pojistky: limit kroků a rozpočtu na úlohu a záznam, které nástroje model volal. U přijatého návrhu je tak vidět, z čeho model vycházel. Tytéž nástroje půjde později nabídnout ven přes MCP (kap. 9.1).

### 9.3 Okno rozhovoru: výpočet ze záměru

Uživatel v okně rozhovoru popíše záměr výpočtu a dostane hotový koncept. Okno je dokovatelný panel, ve výchozím stavu skrytý.

Postup:

1. **Záměr** napíše uživatel vlastními slovy.
2. **Doplňující otázky:** model se doptá (zatížení, materiál, norma…), nic si nedomýšlí potichu.
3. **Osnova:** model navrhne strukturu výpočtu a uživatel ji upraví nebo odsouhlasí.
4. **Koncept:** model vygeneruje bloky, jádro je vyhodnotí, uživatel vidí návrh.
5. **Ladění v rozhovoru** („zkus dřevo“, „přidej průhyb“). Každá změna je opět návrh.

Pojistky:

- **Neprověřené bloky.** Co vytvořila AI, zůstává označené, dokud to člověk blok po bloku neodškrtne jako prověřené. Tisk listu s neprověřenými bloky upozorní, případně stránku označí jako koncept. Podpis patří člověku.
- **Žádná vymyšlená data.** Model nepíše čísla z hlavy. Profil nebo materiál vybere z tabulky v listu. Když tabulka chybí, navrhne ji se zdrojem a člověk ji ověří.
- **Předpoklady viditelně.** Co model předpokládal (součinitele, kategorie užívání), se objeví jako vstupy s poznámkou, ne jako skrytá konstanta.
- **Záměr je součástí dokumentace.** Text zadání jde po přijetí použít jako úvod výpočtu („Předmět výpočtu“). Rozhovor se podle nastavení ukládá do vrstvy Poznámky AI a netiskne se (kap. 9.7).

### 9.4 Obrázky a LLM

**Z obrázku do výpočtu (model obrázek čte):**

- katalog do tabulky (vždy z výřezu, nikdy z celého PDF),
- graf nebo nomogram z normy do tabulky, ve které se pak interpoluje; hodnoty jsou označené jako odečtené z grafu a s odhadem přesnosti,
- fotka výrobního štítku → vstupy (např. parametry motoru),
- výřez výkresu → rozměry a kóty jako vstupy,
- sken ručního nebo starého výpočtu → koncept listu (převod archivů),
- náčrtek schématu → osnova výpočtu (jako v okně rozhovoru, kap. 9.3).

Pravidla:

- **Výřez zůstává v Podkladech** a každá vyčtená hodnota na něj odkazuje.
- **Ověření vedle sebe:** výřez vlevo, vyčtená data vpravo, klik na buňku zvýrazní místo v obrázku. Do odškrtnutí jsou hodnoty neprověřené.
- **Modelu se posílá jen výřez**, ne celá stránka: je to levnější a neodchází nic navíc (razítka, jména, jiné zakázky).
- Funkce jsou dostupné jen u modelu, který umí číst obrázky.

**Z výpočtu do obrázku (model obrázek tvoří):** rozlišujeme účel obrázku.

- **Technický obrázek** (schéma, náčrt nosníku, zapojení) nese údaje. Model navrhne parametrický náčrt navázaný na proměnné listu a kreslí ho program, takže se po změně vstupů překreslí. Žádné vymyšlené kóty.
- **Ilustrační obrázek** (vizualizace, atmosféra, obrázek pro zákazníka) je povolený, i trochu umělecky přehnaný. Musí být **označený jako ilustrační, vytvořený AI**, nesmí nést údaje, ze kterých výpočet vychází, a nikdy se nestane vstupem výpočtu. Výrobek na obrázku nesmí zákazníka klamat.

**Model se dívá na výsledek:** kontrola tisku (nečitelné, přetékající, graf bez popisků) a kontrola obrázků u řádků tabulky. Výsledkem jsou jen poznámky.

### 9.5 Výpočet jako podklad pro prezentaci a web

Výpočet nemusí skončit jen podepsaným tiskem. Může být i **předstupněm webové stránky nebo nabídky**: například prodejce nabízí vzorový výpočet návratnosti fotovoltaiky (R5, R6) s ilustračními obrázky.

- Prezentační výstup vzniká ze stejného listu jako tisk, takže čísla jsou stejná a dohledatelná.
- Vzorový výpočet je **viditelně označený jako orientační** se seznamem předpokladů (cena energie, kurz, degradace panelů…).
- Do budoucna lze uvažovat o interaktivním exportu, kde zákazník mění jen povolené vstupy (plocha střechy, spotřeba) a vzorce zůstávají zamčené.

### 9.6 Teorie k výpočtu a RAG (upřesněno 2026-10-03)

Model má odpovídat z teorie, kterou vybral autor výpočtu, ne „z hlavy“. Teorie slouží i člověku a dá se volitelně vytisknout jako příloha „Teoretický úvod“.

**Kde teorie je:**

- **Malé (školní) výpočty:** přímo ve vrstvách **Podklady** listu (rozhodnuto 2026-10-03: žádný zvláštní typ vrstvy). Každý nadpis je úsek; program mu po dopsání přidělí stálý identifikátor `{#T3}` (v náhledu a tisku jako štítek) a nikdy ho nepřečísluje. Model dostane malou teorii celou.
- **Rozsáhlejší teorie:** samostatný soubor **knihovna teorie `.kalkt`**, ZIP kontejner jako `.kalk` (manifest, SHA-256). Obsahuje teorii v Markdownu rozdělenou na úseky se stálými identifikátory, obrázky s popisky, metadata (název, zdroj, vydání, jazyk, obor, zda lze sdílet) a předpočítaný index s otiskem obsahu, takže hledání je hned po otevření připravené.
- **Vyhrazené adresáře**, prohledávané v pořadí: projekt (vedle listů zakázky) → firma (sdílená složka určená firemními pravidly) → uživatel (Dokumenty\Kalketa\Teorie).
- **Vazba na list:** list si pamatuje identifikátor, verzi a otisk knihovny a **ukládá kopii úseků, které použil nebo citoval** (kap. 5.1). List tak svou teorii dohledá i bez knihovny.

**Knihovna v programu (rozhodnuto 2026-10-03):** vzniká z vrstvy Podklady příkazem „Uložit jako knihovnu teorie“: dialog se zeptá na název, zkratku, verzi, zdroj, obor, jazyk, zda lze sdílet, a do které z prohledávaných složek ji uložit. Ke **výpočtu se připojuje jen pro model** (nabídka „Teorie“ v okně rozhovoru), bez vlastní vrstvy. Úseky knihovny se citují se zkratkou: `[PP:T3]`. Odkaz na knihovnu a kopie citovaných úseků jsou v souboru výpočtu jako `theory/<id>.json`; starší verze programu je ponechá beze změny, formát `.kalk` se proto nemění. Knihovna, jejíž text neodpovídá otisku v manifestu, se nenačte. Firemní složku určuje `theoryFolder` ve firemních pravidlech.

**Pravidla vkládání** (kontrola při importu a uložení, kódy chyb a varování):

- hierarchie nadpisů a rozumná délka úseku (dlouhý se navrhne rozdělit, krátký spojit); identifikátory přiděluje program a nikdy je nepřečísluje,
- zdroj povinně: kniha nebo norma, vydání, strana,
- vzorce **doporučeně v syntaxi Kalkety**: jádro je pak zkontroluje (včetně jednotek) a model je převede přímo na bloky; jinak se vzorce nekontrolují,
- meze platnosti označené (např. `> platnost: λ ≤ 2`), aby je šlo vytáhnout a zkontrolovat proti výpočtu,
- obrázky s popisem (použitelné i pro model, který obrázky nečte),
- klíčová slova česky i anglicky, protože model pod kapotou mluví anglicky a hledání podle slov přes jazyky nefunguje,
- ~~žádná celá PDF~~ (změněno 2026-10-04, viz Studijní podklady níže): do knihovny `.kalkt` se text vkládá a čistí jako dřív, celé PDF smí ležet ve složce teorie jako studijní soubor.

**Hledání (RAG):** malá teorie se modelu pošle celá. Z větší vybere úseky **program** podle slov otázky (kmeny slov bez diakritiky, aby se potkaly tvary „nosník/nosníku“): rychle, deterministicky, offline, s jakýmkoli modelem. Model dostane obsah všech úseků (značky a názvy) a celé jen vybrané; úseky citované dříve v rozhovoru jdou s nimi. Pod odpovědí je vidět, které úseky model dostal. Nástroj `search_theory(dotaz)` pro model může přijít později (lokální modely volají nástroje nespolehlivě). Embeddingy mohou přijít později jako volitelné.

**Vynucení citací:** model musí každé tvrzení o teorii opřít o citovaný úsek (`[T3.2]`). Program ověří, že úsek existuje a že doslovná citace v něm je. Tvrzení bez platné citace se označí jako **nepodložené**, takže je vždy vidět, co model opřel o teorii a co si domyslel.

**Autorská práva:** výtahy z norem ve firemní knihovně jsou pro interní použití, sdílení řídí pole „lze sdílet“ v metadatech.

**Studijní podklady (rozhodnuto 2026-10-04):** do stejných složek teorie (projekt, firma, uživatel) se smí vložit i **PDF, HTML a Markdown tak, jak jsou**. Program z nich přečte text a nabídne je jako knihovnu: v chatu v menu Teorie, citace s klíčem souboru, kopie citovaných úseků ve výpočtu.

- **PDF:** jeden úsek na stránku souboru, `[EC3:T45]` je 45. stránka souboru. Nadpis úseku tvoří kapitola z obsahu PDF a tištěné číslo strany. Rozdělené slovo na konci řádku se spojí, aby šly najít doslovné citace. Text PDF se čte jednou a pak se bere z mezipaměti. Skeny bez textové vrstvy program pozná a upozorní na ně, OCR zatím není.
- **HTML a Markdown:** jeden úsek na kapitolu podle nadpisů.
- **Celá kniha smí zůstat**, ale **čtou se jen vybrané kapitoly nebo stránky**. Nástroje → Studijní podklady ukáže obsah knihy k zaškrtnutí a pole pro stránky („45–80, 112“, jak jsou vytištěné). U knihy nad 60 stran čtené celé program upozorní, že výběr zpřesní odpovědi. Je to doporučení, nic se nezakazuje. Bez výběru se čte celý soubor.
- **Výběr, název a klíč** se ukládají do popisu vedle souboru (`<soubor>.kalketa.json`). Firma tak může mít normy předvybrané pro všechny.
- **Návrh kapitol (etapa C):** tlačítko „Navrhnout podle výpočtu“ porovná text otevřeného výpočtu s kapitolami knihy stejným hledáním, jakým chat vybírá teorii k otázce. Zaškrtne nejvýš tři nejbližší (u kapitoly s vybranou podkapitolou jen podkapitolu). Člověk výběr potvrdí nebo upraví.
- **Převod na knihovnu (etapa C):** „Vložit výběr do Podkladů“ vloží vybrané kapitoly do nové vrstvy Podklady, s nadpisem kapitoly a jejími stranami. Stránka, kterou kapitola sdílí s další, jde jen na výslovné přání. Text se tam vyčistí (Vyčistit text z PDF), doplní obrázky a uloží jako knihovna `.kalkt`. Přímý převod PDF na `.kalkt` by uložil i šum z PDF, proto vede přes Podklady.
- **Vzorce v zápisu Kalkety (2026-10-04):** blok ```` ```kalk ```` v Podkladech obsahuje řádky jazyka výpočtu (`w := 5·q·L^4/(384·E·I)`). V náhledu, tisku i v editoru (pod zápisem) se vysází stejně jako list, symbolicky, nic se nepočítá. Řádek, který jazyk nepřečte, se označí. Model teorii čte jako přesný text. Tlačítko „ƒx Vzorec“ v liště Podkladů.
- **Výřez potvrzeného vzorce se odstraní (2026-10-10):** „✓ Potvrdit vzorec“ smaže i výřez z PDF nad blokem; vzorec ho zastoupí. „Potvrdit a ponechat výřez“ ho nechá sbalený a u sbaleného výřezu je „✕ Odstranit výřez“. Při uložení se obrázky Podkladů, na které už žádný text neodkazuje, do souboru nezapíšou (Ctrl+Z do zavření souboru je vrátí).
- **Důsledek a mez v řádku knihy (2026-10-10):** řádek `S_min <= π·d^2/4 ⇒ d >= sqrt(4·S_min/π) == sqrt(4·23.53/π) ≈ 5.5 mm` se vysází s ⇒ jako v knize. Řetěz za mezí (d ≥ …) se ověří jako odvození, kroky se číslují v celém řádku. π se počítá jako číslo, ne jako značka.
- **Vzorce z výřezů pomocí AI (2026-10-04):** tlačítko „ƒx ✦ Vzorce z výřezů (AI)“ pošle modelu, který čte obrázky, vybraný výřez, jinak všechny výřezy vzorců bez přepisu (a když žádné nejsou, všechny obrázky bez přepisu). Model vzorec zapíše v jazyce Kalkety (`name := výraz`, rovnost `a == b`) a pod obrázek se vloží blok `kalk` s poznámkou „přepsala AI (model) – ověřte a poznámku smažte“. Výřez zůstává jako doklad. Ověřeno 2026-10-04: lokální model uživatele obrázky čte (vzorec ze s. 52 přepsal správně za 7 s).
- **Automatické výřezy (2026-10-04):** „Vložit výběr do Podkladů“ u PDF rozvrhne každou stránku. Kde PDF kreslí obrázek, a řádky, které z textu vyjdou jako vzorec s číslem nebo jako úlomky, vyřízne a vloží na jejich místo jako obrázky (`obrazek-s45.png`, `vzorec-s45.png`). Rozsypaný text vynechá. Obrázek přes skoro celou stránku je sken, ne obrázek. Popisky uvnitř obrázku patří k obrázku. Obrázek kreslený čarami pozná podle plných tvarů (tenké čáry se přidají, jen když na ně navazují, takže zlomková čára ani linky tabulky obrázek netvoří). U skenu, kde obrázek není nijak zvlášť uložený, je obrázek mezera v textu nad popiskem „Obr. N“, případně velká prázdná mezera. Číslovaný vzorec těsně nad obrázkem zůstane samostatný. Výřez vzorce sahá od řádku textu nad ním k řádku pod ním, přes celou šířku sloupce. Drobné úlomky na úrovni řádku (index ve větě, „x = 2/3 l“) patří k větě. Výřezy drží odstup půl řádku od textu kolem (rozpoznaný řádek je menší než jeho písmena na skenu) a ořežou se na kresbu s malým okrajem, takže v nich nezůstane bílé okolí ani kus textu. Obrázek nahoře na stránce (nad ním žádný text) sahá k hornímu okraji. Výřez těsně nad popiskem „Obr.“ je vždy obrázek. Prázdný výřez se vynechá. Ověřeno na sbírce uživatele (sken s OCR), strany 41–50.
- **Výřez z PDF (2026-10-04):** text z PDF ztrácí obrázky a vzorce z něj vyjdou rozsypané. V Podkladech je proto tlačítko „Výřez z PDF“. Ukáže stránky studijního PDF tak, jak jsou vytištěné (začne na první vybrané straně), tažením myší se vybere obrázek, vzorec nebo tabulka a OK je vloží na místo kurzoru jako obrázek s popiskem „Název, s. 45“. Okno je přes skoro celou obrazovku a má zoom (−, +, Na šířku, Ctrl + kolečko). Výřezů jde vložit víc za sebou, okno zavře až Zavřít. Výřez jde **na místo, odkud je**: program vezme řádek textu nad ním (nebo pod ním) na stránce, najde ho v Podkladech a obrázek vloží za něj, a když ho nenajde, na místo kurzoru. Výřez se kreslí ve 200 dpi bez ohledu na zoom. Stránky kreslí pdf.js v editoru.
- **Ověření v Pythonu (2026-10-18):** blok ```` ```python ```` v Podkladech je nezávislý výpočet téže úlohy jinou cestou (simulace krok po kroku místo integrálu, NumPy místo normálních rovnic). Výsledky hlásí funkcí `result("v_A", hodnota, "m/s", rel=1e-6)` jmény listu a v jednotkách podle sebe; tlačítko „▶ Spustit v Pythonu“ pod blokem skript spustí a tabulka postaví každý výsledek vedle hodnoty z jádra Kalkety (převedené do jednotky Pythonu) s rozdílem a ✓/✗; pojmenuje i hodnotu, kterou list nemá, a nesouhlasné jednotky. Dva nezávislé motory, které se shodnou, chybu jádra i přepisu téměř vylučují; špatně pochopené zadání ale neodhalí (oba výpočty píše tentýž autor).
  - **Vestavěný Python** (výchozí): Pyodide 314.0.7 (CPython 3.14 ve WebAssembly) ve vlákně hlavního procesu. Skript nevidí nic z programu: modul `js` je prázdný objekt bez prototypu, `pyodide_js` je odebrán, funkce JavaScriptu ve vlákně nemají `constructor` (jinak by z libovolného objektu vedla cesta přes `Function` k počítači); soubory jsou jen v paměti, síť není. Přibalený je NumPy (wheel stažený při sestavení skriptem `scripts/pyodide-packages.mjs`, ověřený SHA-256 podle `pyodide-lock.json`); za běhu se nic nestahuje. Skript nad 30 s se zastaví i s vláknem. Testy úniků v `packages/desktop/tests/python.test.ts`.
  - **Python z počítače** (Nastavení → Ověřovací Python): plný Python se vším nainstalovaným (SciPy…), spuštěný izolovaně (`-I`) v prázdné dočasné složce, ale s právy uživatele; proto se editor ptá před každým spuštěním.
  - **Vzory se ověřují samy:** referenční testy spustí každý blok ```` ```python ```` v `podklady.md` vzoru ve vestavěném Pythonu a vyžadují shodu všech výsledků s listem (R15–R18).
  - **AI ověřuje v Pythonu (skrytý terminál):** briefing modelu říká, jak ověření napsat (jen když ho editor umí spustit; s NumPy, je-li přibalený). Každý blok ```` ```python ```` v odpovědi program hned spustí (vestavěný Python; Python z počítače jen po potvrzení) a porovná s listem, na který jsou použité návrhy změn téže odpovědi (ověření může patřit k výpočtu, který model navrhuje). Výsledek jde do rozhovoru jako tah programu: tabulka Veličina | Kalketa | Python | Rozdíl | ✓/✗, výstup skriptu a chyba. Když něco nesouhlasí, skript selže nebo nic neohlásí, dostane ho model sám a odpoví znovu (nejvýš 2× za sebou); když vše souhlasí, model se znovu nevolá (šetří tokeny) a výsledek uvidí s další otázkou. Pod odpovědí je „Uložit ověření do Podkladů“: skript se vloží do vrstvy Podklady (vznikne, když chybí) a lze ho tam kdykoli spustit znovu. Protokol je textový jako ```` ```change ````, takže funguje u každého poskytovatele (`packages/ai/src/pythonChecks.ts`).
    - **Po prvním testu s lokální AI (2026-10-18, qwen3.8-flash iq3):** výsledky správně, ale po vypršení času model do Pythonu opsal vzorec z listu (shoda nic nedokazuje), nepostupoval „jako na papíře“ a tvrdil uložení, které neumí. Proto: briefing zakazuje opsat vzorec z listu, radí rozpočet kroků (~milion), RK4 a zastavení u události; zpráva o vypršení času přidá radu, jak skript zrychlit.
- **Podrobnost výpočtu (2026-10-18):** Vlastnosti výpočtu → Podrobnost výpočtu (AI): *Stručně* (definice se vzorcem, tisk dosadí), *Jako na papíře* (vztahy teorie `relation … {eq}` s podmínkami úlohy, odvození `derive` po krocích, pak definice; vzorec z teorie se odvodí, neopíše), *Výukově* (navíc vysvětlení každého kroku a ověření v Pythonu). Nenastavená: model se před psaním výpočtu zeptá **rozhodovacím blokem** a volba se uloží do výpočtu. Briefing k tomu nese obecná pravidla zápisu (zadání nechat, nadpis na část úlohy, zadané hodnoty s jednotkou a komentářem, žádné kopie hodnot v jiné jednotce, jednotka zobrazení přes `|`, žádné prázdné `x =`, předpoklad s citací oddílu, který ho říká, posudek u meze, závěrečná věta s výsledky) a průvodce jazykem ukázku „jako na papíře“.
- **Bloky odpovědi pro uživatele (2026-10-18):** ```` ```choice [klíč] Otázka? ```` s odpověďmi `hodnota: popis` na řádcích se ukáže jako tlačítka; kliknutí pošle odpověď jako tah uživatele a model pokračuje (klíč `detail` navíc uloží úroveň podrobnosti). ```` ```note ai Nadpis ```` / ```` ```note sources Nadpis ```` je návrh zápisu do Poznámek AI / Podkladů: karta pod odpovědí s tlačítkem „Vložit…“, po vložení „Vloženo“. Model sám do vrstev nepíše a nesmí tvrdit, že něco uložil (`packages/ai/src/answerBlocks.ts`, `writingRules.ts`).

### 9.7 Vrstva Poznámky AI (upřesněno 2026-10-03)

Vrstva je **deník záznamů**, ne jeden dlouhý text:

```text
layers/ai/
├── entries.json        seznam záznamů (metadata)
├── memory.md           paměť listu pro model (anglicky, krátká)
├── entries/<id>.md     text záznamu (anglicky, Markdown)
└── images/             výřezy použité v rozhovorech
```

**Každý záznam nese:**

- druh: rozhovor, kontrola, vysvětlení, návrh změny, návrh tabulky,
- datum, poskytovatele a model,
- **otisk listu v té chvíli**; když se list od té doby změnil, záznam se označí jako **zastaralý**,
- odkazy na řádky a bloky listu, kterých se týká,
- citace a jejich stav: ověřená, nebo nepodložená (kap. 9.6),
- stav: otevřený, vyřízený; u návrhu přijatý, nebo odmítnutý. U přijatého návrhu jde dohledat, z jakého rozhovoru přišel.

**Paměť listu:** krátký text, který si model udržuje: záměr výpočtu, dohodnuté předpoklady, co už bylo zkontrolováno. Při dalším otevření listu model nezačíná od nuly a nemusí číst staré rozhovory, což šetří kontext.

**Co smí člověk:** text AI nepřepisuje, aby záznam zůstal autentický. Smí:

- označit záznam jako vyřízený nebo ho skrýt,
- připsat vlastní poznámku (např. proč návrh odmítl), uloženou zvlášť a označenou jako lidská,
- **úplně smazat záznam, nebo celou vrstvu AI.**

**Nastavení programu:**

- **Ukládat rozhovory automaticky** do vrstvy AI, nebo jen na pokyn uživatele.
- **Vynechat poznámky AI při předání listu** (kopie pro zákazníka nebo kontrolora). Vrstva může obsahovat interní debatu, ceny nebo jména. Firemní pravidla mohou tuto volbu vynutit.

**Tisk:** příloha z vrstvy AI není přepis rozhovorů, ale **protokol**: provedené kontroly, jejich výsledek a stav a přijaté návrhy.

**Uspořádání vrstvy (rozhodnuto 2026-10-04):** hlavní část jsou **zdroje a citace**, odkud AI čerpala, seskupené podle zdroje (Podklady listu, knihovny teorie, později web) se stavem citací. Pod nimi **paměť pro AI**, kterou model po skončení rozhovoru aktualizuje **automaticky** (Nový rozhovor, vypnutí AI, 3 minuty bez otázky); dotaz navíc nevadí, lokální model nic nestojí a ceny za tokeny klesají. **Rozhovory** jsou až na vyžádání (Zobrazit rozhovory). Uloženo zatím jako `layers/<ai>/memory.md` a `layers/<ai>/conversations.json`; deník `entries` přijde s kontrolami a návrhy změn.

**Návrhy změn (etapa 3a, 2026-10-04):** model navrhuje změnu řádků blokem ```` ```change 8 ```` (nebo `change 8-10`, `change after 8`) s novými řádky. Pod odpovědí se ukáže karta: původní a nové řádky, dopad na výpočet (počet chyb, posudky s využitím před → po) a tlačítka **Přijmout / Odmítnout**. Výpočet se změní jen přijetím, jedním krokem Zpět se vrací řádky i rozhodnutí. Když se dotčené řádky mezitím změnily, návrh je zastaralý a přijmout nejde. Každý návrh a rozhodnutí se zapíše do deníku `layers/<ai>/entries.json` (sekce Návrhy změn ve vrstvě AI). **Značka AI (etapa 3b, 2026-10-04):** přijaté řádky mají na obrazovce u čísla řádku značku **AI** a fialový okraj, dokud je člověk neoznačí jako prověřené (menu značky nebo tlačítko na kartě návrhu; Zpět to vrátí). Značka se drží textu řádku, takže ji neposune vložení řádku nad ním. Když člověk řádek sám upraví, je to jeho řádek a značka zmizí. Model v deníku vidí, které jeho změny už někdo prověřil.

**Návrhy jedné odpovědi dohromady a nový list (2026-10-04):** pod odpovědí s návrhy je **Přijmout vše** se společným dopadem na výpočet (návrhy se použijí odspodu, překrývající se nejdou) a **Do nového listu**. To zkopíruje výpočet do nové neuložené záložky (tabulky, vrstvy, knihovny a rozhovory ano, revize ne) a změny použije tam. V kopii jsou přijaté řádky označené AI, původní list zůstane beze změny a jeho deník zapíše „Přijato do nového listu“. Model ví, že nový list jde udělat.

**Nový výpočet od AI (2026-10-04):** model smí napsat celý nový výpočet jako blok ```` ```sheet Název ````. Pod odpovědí je karta s náhledem, výsledkem nového výpočtu (chyby a posudky) a tlačítkem **Otevřít jako nový list**. Nový list převezme tabulky, vrstvy, teorii a rozhovory otevřeného výpočtu, ne jeho revize ani paměť pro AI. Všechny jeho řádky mají značku AI, dokud je člověk neprověří. Model dostává i **ostatní otevřené listy** jako zdroj a inspiraci, jen ke čtení: nejvýš 6 000 znaků z každého a 15 000 celkem.

**Tisk (etapa 3c, 2026-10-04):** když výpočet obsahuje neprověřené řádky AI, Tisk i Export PDF se nejdřív zeptají. V tisku mají tyto řádky na okraji značku **AI** a svislou čáru a pod názvem je upozornění. Vrstva Poznámky AI se při zapnutém „Tisknout jako přílohu“ vytiskne jako **protokol**: zdroje a citace a všechny návrhy změn s rozhodnutím a prověřením (původní a nové řádky). Rozhovory a paměť pro AI se netisknou.

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
- složití autonomní AI agenti. Rozhovor, ve kterém model jen čte a navrhuje přes nástroje programu a všechno schvaluje člověk (kap. 9.2 a 9.3), autonomní agent není.

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
