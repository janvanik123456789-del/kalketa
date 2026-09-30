# Referenční výpočty

Každý referenční výpočet (R1–R6, viz docs/01-filozofie.md, kap. 10) má vlastní složku
s listem a nezávisle ověřenými očekávanými výsledky (s tolerancí a zdrojem ověření).

Jádro je hotové, až projdou všechny bez kódu specifického pro jeden obor.

| Složka | Obor | Co ověřuje |
|---|---|---|
| R1-nosnik | stavař | výběr profilu z tabulky, posudky, nejlehčí vyhovující profil |
| R2-vymenik-hridel | strojař | °C a rozdíly teplot, logaritmický teplotní spád, vlastní funkce, řešič pro nejmenší průměr, materiál z tabulky |
| R3-roztok | chemik | tabulka látek (molární hmotnost), ředění, disociační rovnováha řešičem, pH |
| R4-kabel | elektrikář | 2D interpolace korekčních součinitelů, nejmenší vyhovující průřez, komplexní impedance a úbytek napětí |
| R5-fotovoltaika | ekonom | vlastní měna, kurz k datu z tabulky, řady peněžních toků, NPV, IRR, doba a datum návratnosti |
