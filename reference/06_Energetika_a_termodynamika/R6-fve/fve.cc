# Fotovoltaika 10 kWp – elektricky i ekonomicky
"Referenční výpočet R6: návrh FVE na rodinném domě a její návratnost v jednom listu."
@digits 6

## Zadání
panel := pick(Panely, "PV-450")
N := 22                                     ' panelů celkem
N_s := 11                                   ' panelů v řetězci (2 řetězce)
P_dc := N·panel.P_max | kWp
datum_nakupu := 2026-10-03
kurz := find_max(Kurzy, by: datum, where: r.datum ≤ datum_nakupu).EUR
unit EUR := kurz·CZK

## Řetězec a střídač
U_mp := N_s·panel.U_mp | V
I_mp := panel.I_mp
stridac := find_min(Stridace, by: cena, where: r.P_ac ≥ P_dc/1.2 and r.U_max ≥ 1.25·U_mp)

## DC kabel řetězce
L_dc := 30 m
θ := 40 °C                                  ' teplota pod panely
k := interpolate(Korekce, θ: θ, n: 2).k      ' dva řetězce ve svazku
kabel := find_min(Kabely_DC, by: S, where: r.I_z·k ≥ 1.25·I_mp)
ΔU := 2·kabel.R·L_dc·I_mp | V
ΔU_rel := ΔU/U_mp | %

## Výroba
PR := 0.82                                  ' výkonnostní poměr
E_rok := sum(Osluneni.H)·P_dc·PR | kWh

## Náklady
C := N·panel.cena_EUR·EUR + stridac.cena + 2·L_dc·kabel.cena + 45000 CZK | CZK
dotace := 50000 CZK

## Ekonomika
roky := range(1, 25)
cena_t := (0.7·5.8 CZK/kWh + 0.3·1.2 CZK/kWh)·(1 + 3 %)^(roky - 1)
uspora := E_rok·(1 - 0.5 %)^(roky - 1)·cena_t | CZK
CF := [-(C - dotace), uspora]
NPV := npv(4 %, CF) | CZK
IRR := irr(CF) | %
doba := payback(CF)
navrat := datum_nakupu + doba·1 yr

## Posouzení
check "Výkon střídače": P_dc ≤ 1.2·stridac.P_ac               source "doporučení výrobce"
check "Napětí řetězce": 1.25·U_mp ≤ stridac.U_max            source "ČSN 33 2000-7-712"
check "Zatížitelnost DC kabelu": 1.25·I_mp ≤ kabel.I_z·k      source "ČSN 33 2000-7-712"
check "Úbytek napětí DC": ΔU_rel ≤ 1 %                        source "doporučení"
check "Doba návratnosti": doba ≤ 10                           source "zadání investora"
