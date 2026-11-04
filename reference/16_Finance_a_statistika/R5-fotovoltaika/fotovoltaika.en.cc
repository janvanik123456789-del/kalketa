# Payback of a photovoltaic system
"Reference calculation R5: a 10 kWp PV system on a family house, panels paid for in euros."
@digits 6

dimension Mena
unit CZK: Mena

## Input
datum_nakupu := 2026-10-03                      ' Saturday: the last known rate applies
kurz := find_max(Kurzy, by: datum, where: r.datum ≤ datum_nakupu).EUR
unit EUR := kurz·CZK
investice := 12500 EUR | CZK
dotace := 50000 CZK
vyroba := 9800 kWh                              ' production in the first year
podil_spotreby := 70 %                          ' consumed in the house, the rest sold
cena_nakup := 5.8 CZK/kWh
cena_prodej := 1.2 CZK/kWh
degradace := 0.5 %                              ' annual drop in panel output
rust_cen := 3 %                                 ' annual growth of electricity prices
diskont := 4 %
roky := range(1, 25)

## Cash flows
vyroba_t := vyroba·(1 - degradace)^(roky - 1)
cena_t := (podil_spotreby·cena_nakup + (1 - podil_spotreby)·cena_prodej)·(1 + rust_cen)^(roky - 1)
uspora := vyroba_t·cena_t | CZK
CF := [-(investice - dotace), uspora]

## Evaluation
NPV := npv(diskont, CF) | CZK
IRR := irr(CF) | %
doba := payback(CF)
navrat := datum_nakupu + doba·1 yr

check "Net present value": NPV ≥ 0 CZK     source "investor's brief"
check "Payback period": doba ≤ 12             source "investor's brief"
