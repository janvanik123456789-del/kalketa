# Referenční výpočty

Každý referenční výpočet (R1–R8, viz docs/01-filozofie.md, kap. 10) má vlastní složku
s listem a nezávisle ověřenými očekávanými výsledky (s tolerancí a zdrojem ověření).

Jádro je hotové, až projdou všechny bez kódu specifického pro jeden obor.

| Složka | Obor | Co ověřuje |
|---|---|---|
| R1-nosnik | stavař | výběr profilu z tabulky, posudky, nejlehčí vyhovující profil |
| R2-vymenik-hridel | strojař | °C a rozdíly teplot, logaritmický teplotní spád, vlastní funkce, řešič pro nejmenší průměr, materiál z tabulky |
| R3-roztok | chemik | tabulka látek (molární hmotnost), ředění, disociační rovnováha řešičem, pH |
| R4-kabel | elektrikář | 2D interpolace korekčních součinitelů, nejmenší vyhovující průřez, komplexní impedance a úbytek napětí |
| R5-fotovoltaika | ekonom | vlastní měna, kurz k datu z tabulky, řady peněžních toků, NPV, IRR, doba a datum návratnosti |
| R7-kvadraticka-rovnice | výuka | kvadratická rovnice jako na papíře: podmínka řešitelnosti, kořeny s dosazením, Vietovy vzorce, rozklad, vrchol přes derivaci, tečna s úhlem, plocha mezi kořeny, graf s body a šrafováním, posuvníky koeficientů |
| R8-quadratic-equation | výuka | totéž v angličtině (soubor `*.en.cc` se tiskne anglicky) |
| R6-fve | průřezový | FVE elektricky i ekonomicky v jednom listu: šest tabulek, výběr střídače a kabelu podle více podmínek, 2D korekce, výroba ze sloupce tabulky, měna s kurzem k datu, NPV, IRR, doba a datum návratnosti |
