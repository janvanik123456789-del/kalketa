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
