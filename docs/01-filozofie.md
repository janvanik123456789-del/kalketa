# Kalketa — Filozofie programu

**Verze:** 2.0 (návrh)
**Datum:** 2026-09-29
**Stav:** Návrh k diskusi. Nahrazuje `calc-canvas/01-philosophy.md`. Upraveno 2026-09-30: libovolný počet vrstev (kap. 4). Upraveno 2026-10-02: připojení LLM, průvodce pro model, okno rozhovoru, obrázky, prezentace a web (kap. 9.1–9.5, 11). Upraveno 2026-10-03: teorie k výpočtu, knihovna `.kalkt` a RAG, vrstva Poznámky AI (kap. 4, 9.6, 9.7).

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

**Pravidla vkládání** (kontrola při importu a uložení, kódy chyb a varování):

- hierarchie nadpisů a rozumná délka úseku (dlouhý se navrhne rozdělit, krátký spojit); identifikátory přiděluje program a nikdy je nepřečísluje,
- zdroj povinně: kniha nebo norma, vydání, strana,
- vzorce **doporučeně v syntaxi Kalkety**: jádro je pak zkontroluje (včetně jednotek) a model je převede přímo na bloky; jinak se vzorce nekontrolují,
- meze platnosti označené (např. `> platnost: λ ≤ 2`), aby je šlo vytáhnout a zkontrolovat proti výpočtu,
- obrázky s popisem (použitelné i pro model, který obrázky nečte),
- klíčová slova česky i anglicky, protože model pod kapotou mluví anglicky a hledání podle slov přes jazyky nefunguje,
- žádná celá PDF: text se vloží nebo převede (OCR, LLM) a člověk ho potvrdí.

**Hledání (RAG):** malá teorie se modelu pošle celá. Větší se prohledává nástrojem `search_theory(dotaz)` podle slov: rychle, deterministicky, offline, s jakýmkoli modelem. Embeddingy mohou přijít později jako volitelné.

**Vynucení citací:** model musí každé tvrzení o teorii opřít o citovaný úsek (`[T3.2]`). Program ověří, že úsek existuje a že doslovná citace v něm je. Tvrzení bez platné citace se označí jako **nepodložené**, takže je vždy vidět, co model opřel o teorii a co si domyslel.

**Autorská práva:** výtahy z norem ve firemní knihovně jsou pro interní použití, sdílení řídí pole „lze sdílet“ v metadatech.

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
