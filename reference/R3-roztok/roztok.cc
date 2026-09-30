# Fyziologický roztok a kyselina octová
"Referenční výpočet R3: příprava roztoku z tabulky látek a disociační rovnováha slabé kyseliny."

## Příprava roztoku
sul := pick(Latky, "NaCl")
V := 500 mL
c := 0.154 mol/L                             ' fyziologický roztok
m := c·V·sul.M | g
w := m/(m + V·1 kg/L) | %                    ' hmotnostní zlomek (hustota vody 1 kg/L)

## Ředění
c_2 := 0.05 mol/L
V_2 := c·V/c_2 | mL

## Disociace kyseliny octové
K_a := 0.000018                              ' při 25 °C
c_0 := 0.1 mol/L
solve x: x²/(c_0 - x) == K_a·(1 mol/L) in 0 mol/L .. 0.1 mol/L
pH := -log10(x/(1 mol/L))
α := x/c_0 | %                               ' stupeň disociace

## Posouzení
check "Sůl se rozpustí": m ≤ sul.rozpustnost·V     source "tabulka látek"
check "Slabá kyselina": α ≤ 5 %                   source "zjednodušení x ≪ c_0"
