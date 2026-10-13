# Připomínky z testování

Po dávce napište v konverzaci „zpracuj připomínky“. Hotové body se odškrtnou a doplní se k nim, co se změnilo.
Když něco spadne, ztrácí data nebo nejde dál testovat, napište to hned, nečekejte na dávku.

## Vzor jednoho bodu

### 1. Krátký název
- **Kde:** list / Podklady / plátno / tisk / nastavení …
- **Co jsem dělal:** …
- **Co se stalo:** …
- **Co jsem čekal:** …
- **Soubor nebo snímek:** cesta k .kalk nebo obrázku (nepovinné)

---

## Připomínky

1. ~~Graf a plátno musí mít možnost měnit velikost i nepoměrově, prostým tažením za manipulátor. Ten chybí na okrajích jsou jenom v rozích poměrové manipulátory.~~
   **Vyřízeno 2026-10-12:** graf i plátno mají kromě rohů (poměrově) úchyty uprostřed hran. Graf: boční hrana mění jen šířku, horní a dolní jen výšku (v zápisu `place: "… ratio=0.6"`). Plátno: hrana zvětší nebo zmenší plochu plátna, kresba se nedeformuje (jako úchyt velikosti v okně plátna). Fotka zůstává jen poměrová.

2. ~~U textového pole v plátně chybí výběr fontu.~~
   **Vyřízeno 2026-10-12:** výběr písma je i v hlavní liště plátna (u vybraného textu i pro nový) a písem je víc: bezpatkové, patkové, strojové, Arial, Times New Roman, Calibri a technické podle ISO 3098 (ISOCPEUR / osifont, kde je nainstalované).   

3. ~~Výběr z tabulky dá jen řádek, bez jednotky (u nýtu `pick(Tabulka_prumeru_nytu, "6")` ukáže „6“, i když sloupec průměru má mm). Hodnota s jednotkou je až `pick(…, "6").c_112`. Při výběru řádku z rozbalovacího seznamu by měla jít rovnou zvolit hodnota, kterou převzít („6 → d = 6 mm“), a `.sloupec` se doplní sám.~~
   **Vyřízeno 2026-10-12:** v rozbalovacím seznamu výběru klik na název vybere řádek, klik na číslo převezme i hodnotu toho sloupce s jednotkou (`pick(…, "6").c_112` → 6 mm); tlačítko pak ukazuje „→ c_112“ a jiný klik sloupec vymění.

4. ~~Rozbila se editace textu. Text by měl být vkládaný jako formátovaný, vlastnosti skryté a editace jako ve Wordu, ne pravým tlačítkem, ale menu (jako PowerPoint, Word, panel Vlastnosti v LibreOffice).~~
   **Vyřízeno 2026-10-12:** text a nadpisy se na listu upravují rovnou naformátované, bez uvozovek a značek `{…}`; program je zapisuje sám. Tučné a kurzíva se dají na označená slova (Ctrl+B, Ctrl+I). Nové menu **Formát** obsahuje písmo, velikost, barvu, styl odstavce (Normální / Nadpis 1–3) a zarovnání (Ctrl+L, E, R, J). Při úpravě textu je stejné nastavení nahoře v postranním panelu jako „Znak“ a „Odstavec“. Napsané `"` se mění na „ “; uvozovka napsaná ze zvyku na konci se nezdvojí. Zápis se značkami jde otevřít přes „Upravit jako zápis“. Příčina rozbití v `Vypocet_prumeru_nytu.kalk`: na řádku 7 chyběla zavírací uvozovka (`"Koeficient dynamiky namáhání {font=serif italic}`). Nový editor takový řádek opraví při první úpravě textu.

5. ~~Mezi buňkami chybí mezera; při označování textu v buňce se poslední tři písmena neoznačí, kurzor se musí stáhnout mimo sousední buňku.~~
   **Vyřízeno 2026-10-12:** mezi buňkami je 10 mm (na listu i v tisku). Buňka už se nezužuje pod šířku svého textu, takže sousední buňka nepřekrývá jeho konec. Při úpravě jedné buňky nejde označovat text v sousední. Smoke test označí text buňky tažením myší až za poslední písmeno a ověří, že je označený celý.

6. ~~Proč nejde použít celou paletu písem? Měla by se brát z operačního systému.~~
   **Vyřízeno 2026-10-12:** písma se načítají z operačního systému (Windows z registru, Linux přes fontconfig). Nabízí je menu Formát → Písmo, panel Vlastnosti i plátno; každé písmo je v seznamu ukázané samo sebou. Druhy (patkové, bezpatkové, strojové) zůstávají na začátku, protože existují na každém počítači. V zápisu je to `font=Times_New_Roman` (`_` místo mezery). Když písmo na jiném počítači chybí, použije se bezpatkové a seznam ho označí „na tomto počítači chybí“.

7. ~~Zrušit vložení nadpisu, nadpis si každý udělá editací textu.~~
   **Vyřízeno 2026-10-12:** příkaz Nadpis je pryč z menu Vložit i z panelu nástrojů. Nadpis se udělá z textu stylem odstavce (Formát → Styl → Nadpis 1–3, Ctrl+Alt+1–3).

8. ~~Snadnější mazání buněk: v textu nefunguje zkratka na mazání, buňka zmizí, až když se vymaže celý text.~~
   **Vyřízeno 2026-10-12:** Ctrl+Shift+K (Úpravy → Smazat řádek) smaže buňku i z formátovaného textu, Ctrl+D ji zdvojí. Kontextová nabídka buňky má „Smazat buňku“. Smazáním první buňky řádku se sousední buňka stane začátkem řádku a neposkočí k řádku nad ní.

9. ~~Když označím část textu a dám barvu, obarví se celý řádek.~~
   **Vyřízeno 2026-10-12:** barva z menu Formát, z panelu Vlastnosti i z pravého tlačítka teď platí jen pro označená slova, stejně jako tučné a kurzíva. Výběr zůstane označený, takže jde rovnou dát další formát. Bez označení se obarví celý řádek. V zápisu je to `{red}slova{/}`.

10. ~~Barvy doplnit celou paletou.~~
   **Vyřízeno 2026-10-12:** v panelu Vlastnosti je u barvy tlačítko s paletou jako ve Wordu: Automatická, barvy motivu se světlejšími a tmavšími odstíny, standardní barvy, barvy čitelné i v černobílém tisku, naposledy použité a „Další barvy…“ (systémový výběr libovolné barvy). Menu Formát → Barva i pravé tlačítko mají „Další barvy…“, které paletu otevře. Platí pro označená slova, bez označení pro celý řádek. V zápisu `color=#c00000`, uvnitř textu `{#c00000}slova{/}`.

11. Při ukončení programu nabídnout uložení
   - **Kde:** zavření okna / Soubor → Konec
   - **Co se stalo:** když jsou v listu neuložené změny, program se zeptá jen „Zahodit / Zrušit“. Možnost uložit chybí.
   - **Co jsem čekal:** jako ve Wordu „Uložit / Neukládat / Zrušit“. Uložit uloží všechny neuložené dokumenty (u nového se zeptá na název) a pak program zavře.

12. ~~Kvadratická rovnice jako na papíře, ne `roots` jako v Matlabu; pamatovat na podmínky řešení (např. x jen v reálných číslech).~~
   **Vyřízeno 2026-10-12:** `solve x ∈ ℝ, x > 0: a·x^2 + b·x + c == 0`. Tisk ukáže podmínky, diskriminant s dosazením, `x₁,₂ = (−b ± √D)/(2·a)` s dosazením, oba kořeny a u vyřazeného důvod („nevyhovuje podmínce x > 0“), nakonec `⇒ x = …`. Při D < 0 v ℝ: „rovnice nemá v ℝ řešení“; v ℂ komplexní kořeny. Nový znak `±` (`(-b ± √D)/(2·a)` dá obě hodnoty) a tlačítka `± ∈ ℝ ℂ` na liště Operátory. Opravena chyba, kdy `solve x: 5·x^2 + 4·x - 10 == 0` hlásilo „Řešení se nenašlo“: kořen rovnice s nulou na pravé straně se špatně ověřoval.

13. ~~Napsat obecnou rovnici y := a·x² + b·x + c, která se pak doplní, a dát ji do grafu.~~
   **Vyřízeno 2026-10-12:** `y(x) := a·x^2 + b·x + c`, pak `solve x ∈ ℝ, x > 0: y(x) == 0`. Tisk: y(x) = 0, podmínky, a·x² + b·x + c = 0, s čísly 5·x² + 4·x − 10 = 0, diskriminant, kořeny. Graf: `plot(y(x), x: -3 .. 2)`. Funkce listu se teď v `solve` rozepíše vždy, i bez podmínek (`solve x: y(x) == 0` dřív hlásilo „Řešení se nenašlo“).

14. ~~Nastavení rozsahu osy y v grafu: teď plyne z rozsahu x a velké hodnoty y dělají graf nečitelný v průsečíku s osou x.~~
   **Vyřízeno 2026-10-12:** pravé tlačítko na grafu → „Rozsah osy y…“ (např. `-20; 20`), zpět „Osa y podle hodnot“. V zápisu `plot(y(x), x: -3 .. 2, ylim: -20 .. 20)`. Co leží mimo rozsah, graf ořízne.

15. ~~Doplnit do grafu možnost zobrazení kořenů.~~
   **Vyřízeno 2026-10-12:** pravé tlačítko na grafu → „Zobrazit kořeny (průsečíky s osou x)“. Na ose x se ukáže kroužek v barvě křivky a hodnota `x = 1,07`. V zápisu `plot(y(x), x: -3 .. 2, roots: true)`.

16. ~~U symetrického grafu by se hodilo zobrazit osu symetrie.~~
   **Vyřízeno 2026-10-12:** pravé tlačítko na grafu → „Zobrazit osu souměrnosti“. Ukáže se čerchovaná svislá čára s popiskem `x = −0,4`. Program osu hledá ve vrcholech křivky a nakreslí ji jen tam, kde je křivka opravdu souměrná (parabola, kosinus). V zápisu `plot(y(x), x: -3 .. 2, symmetry: true)`.

17. ~~Zobrazit v grafu i vrchol paraboly. První derivace?~~
   **Vyřízeno 2026-10-12:**
   - **V grafu:** pravé tlačítko → „Zobrazit vrcholy (maxima a minima)“, kosočtverec se souřadnicemi `[−0,4; −10,8]`. V zápisu `plot(y(x), x: -3 .. 2, extremes: true)`. Vrchol je místo, kde je první derivace nulová; graf ho najde i u jiných křivek než paraboly.
   - **Výpočtem:** `solve x_v: y′(x_v) == 0` a `y_v := y(x_v)`. Tisk jako na papíře: y′(x_v) = 0, 2·a·x_v + b = 0, x_v = −b/(2·a) = −4/(2·5) = −0,4. Derivaci funkce listu program nově sestaví podle vzorce. Dřív ji počítal jen numericky a `solve` s ní nekonvergovalo.

18. ~~Integrál mezi kořeny kvadratické rovnice: kořeny jsou v tisku x₁ a x₂, ale pro další výpočet tak definované nejsou.~~
   **Vyřízeno 2026-10-13:** `solve x ∈ ℝ, …` teď kořeny definuje i jako `x_1`, `x_2`, tedy stejně, jak je tisk čísluje, a to i kořen vyřazený podmínkou. `integral(y(x), x: x_2 .. x_1)` tak funguje. Plocha je `abs(…)`, protože pod osou x vychází integrál záporný. Opraveno i „−0“ (dnes 0) a v grafu „x = 2,107E−8“ místo 0: body nalezené hledáním se zaokrouhlí na přesnost grafu.

19. ~~V menu grafu vyšrafovat plochu omezenou integrálem; táhnout bod po křivce s tečnou a úhlem od osy x (první derivace); inflexní body (druhá derivace); popisky polohově editovatelné, aby neprotínaly křivku.~~
   **Vyřízeno 2026-10-13:** vše je v nabídce grafu (pravé tlačítko).
   - **Plocha:** „Vyšrafovat plochu pod křivkou…“ nabídne meze mezi kořeny a do šrafování napíše `S = …`.
   - **Tečna:** „Tečna s úhlem od osy x“ ukáže bod, který jde myší táhnout po křivce, a u tečny `k = y′(x₀)` a `α` od osy x.
   - **Inflexní body:** „Zobrazit inflexní body“ ukáže místa, kde druhá derivace mění znaménko (u paraboly žádné nejsou).
   - **Popisky:** jdou chytit myší a přesunout. Posun se uloží do grafu a platí i v tisku, „Popisky na původní místo“ je vrátí. Popisky se teď kreslí nad všemi značkami.
   - **Zápis:** `area: x_2 .. x_1`, `tangent: 3`, `inflections: true`, `labels: "…"`.

20. ~~Šrafování propojit s integrálem. Tečna při tažení uteče z grafu; bod se má táhnout po křivce, ne jen vodorovně.~~
   **Vyřízeno 2026-10-13:**
   - **Šrafování podle integrálu:** pravé tlačítko na grafu → „Vyšrafovat plochu pod křivkou“ → „podle P := abs(integral(…))“. Nabídka ukáže integrály listu nad grafem. Šrafování převezme jejich meze i funkci pod integrálem a napíše jméno a hodnotu z listu (`P = 14,91`). Když se integrál změní, změní se i šrafování. V zápisu `area: P`.
   - **Tečna:** bod jde vždy na místo křivky nejbližší ukazateli, i když myš z křivky sjede, a zůstává ve viditelné části grafu (i s `ylim`). Tečna se zapne rovnou na viditelné části křivky.

21. ~~Šrafování propojit podle pojmenování vzorce. Tečna při manipulaci ujíždí a graf spadne s neznámou chybou (soubor `Kvadraticke_rovnice.kalk`).~~
   **Vyřízeno 2026-10-13:**
   - **Podle jména vzorce:** `integral(y(x), x: -1 .. 2) {eq=Integral1}` a v grafu `area: Integral1`. Nabídka šrafování vzorec nabídne jako „podle Integral1: integral(…)“. Integrál může stát i pod grafem, šrafování převezme jeho meze a hodnotu (`Integral1 = 27`).
   - **Příčina pádu:** při tažení se graf po každém zápisu znovu vykreslí. Prohlížeč pak posílal další pohyby myši zmizelému prvku, takže bod přestal sledovat myš. Program navíc měřil zmizelý obrázek grafu s rozměry 0 × 0 a zapsal `tangent: NaN`, na kterém graf spadl.
   - **Oprava:** tah drží ukazatel na celé stránce, graf se pro každý pohyb hledá znovu a neplatné číslo se nikdy nezapíše.
   - **Tečna:** bod stojí na křivce ve stejném x jako myš, takže nepřeskakuje mezi větvemi úzké paraboly. Kde je křivka mimo rozsah osy y, zůstane na nejbližším viditelném místě.
   - **Smoke test:** dřív posílal pohyby myši tak, že dorazil jen poslední, a proto chybu nezachytil. Teď táhne krok za krokem a na starém kódu chybu ukáže.
   - **Ve vašem souboru** zůstalo na řádku grafu `tangent: NaN`: smažte ho, nebo zapněte tečnu znovu z nabídky.

22. ~~Vylepšit list o kvadratické rovnici (všechny navržené body), doplnit vysvětlující texty a uložit i anglickou verzi do vzorových příkladů.~~
   **Vyřízeno 2026-10-13:**
   - **Vzorové příklady:** Soubor → Vzorové příklady → „7 Kvadratická rovnice“ a „8 Quadratic equation“ (tiskne se anglicky). Česká verze je uložená i vedle vašeho souboru jako `Testovaci_priklady/Kvadraticke_rovnice_vzor.kalk`, váš soubor zůstal beze změny.
   - **Obsah listu:** vysvětlující texty, kontrola D ≥ 0, Vietovy vzorce, rozklad na kořenové činitele (ověřený v bodě, protože `derive` ověřuje pro libovolné hodnoty, kdežto rozklad platí jen pro tyto kořeny), vrchol přes derivaci s kontrolou vzorcem, tečna s úhlem, plocha jako `abs(integral…)` mezi kořeny, graf s body, šrafováním a tečnou.
   - **Nové v programu:**
     - vrchol `V = [−b/(2·a); −D/(4·a)]` v řešení kvadratické rovnice;
     - `points: [x_v, y_v]` v grafu („Vyznačit bod z listu…“);
     - plocha přes osu x se šrafuje zvlášť nad a pod osou a popisek ukáže obě části;
     - posuvníky `{slider=-5..5}` („Posuvník pro hodnotu…“ v nabídce řádku).
   - **Ověření:** výsledky obou vzorů jsou nezávisle spočtené a hlídá je referenční test (R7, R8).
