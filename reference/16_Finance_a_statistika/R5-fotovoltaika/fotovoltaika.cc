# Návratnost fotovoltaiky
"Referenční výpočet R5: FVE 10 kWp na rodinném domě, panely placené v eurech."
@digits 6

dimension Mena
unit CZK: Mena

## Zadání
datum_nakupu := 2026-10-03                      ' sobota: platí poslední známý kurz
kurz := find_max(Kurzy, by: datum, where: r.datum ≤ datum_nakupu).EUR
unit EUR := kurz·CZK
investice := 12500 EUR | CZK
dotace := 50000 CZK
vyroba := 9800 kWh                              ' výroba v prvním roce
podil_spotreby := 70 %                          ' spotřebováno v domě, zbytek prodán
cena_nakup := 5.8 CZK/kWh
cena_prodej := 1.2 CZK/kWh
degradace := 0.5 %                              ' pokles výkonu panelů za rok
rust_cen := 3 %                                 ' růst cen elektřiny za rok
diskont := 4 %
roky := range(1, 25)

## Peněžní toky
vyroba_t := vyroba·(1 - degradace)^(roky - 1)
cena_t := (podil_spotreby·cena_nakup + (1 - podil_spotreby)·cena_prodej)·(1 + rust_cen)^(roky - 1)
uspora := vyroba_t·cena_t | CZK
CF := [-(investice - dotace), uspora]

## Vyhodnocení
NPV := npv(diskont, CF) | CZK
IRR := irr(CF) | %
doba := payback(CF)
navrat := datum_nakupu + doba·1 yr

check "Čistá současná hodnota": NPV ≥ 0 CZK     source "zadání investora"
check "Doba návratnosti": doba ≤ 12             source "zadání investora"
