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
