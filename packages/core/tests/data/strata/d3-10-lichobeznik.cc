# 10 — lichoběžníkové pravidlo: identita, presnost na kvadratické funkci, kumulace
# Reference: přesný integrál ve zlomcích; chyba složené liché obecně je známá v vzorci.

x := [0, 1, 3, 6, 10]
f := [0, 1, 9, 36, 100]           ' y = x², ale nepravidelná síť
lich := trapz(x, f)
presne := 1000 / 3                ' ∫₀¹⁰ x² dx
chyba := lich - presne

g := [0, 1, 2, 3, 4]              ' lineární funkce: lichoběžník je přesný
linear := trapz(x, g)
linearni_integral := trapz([0, 10], [0, 4])

h := [1, 1, 1, 1, 1]
konstanta := trapz(x, h)
kumul := cumtrapz(x, h)
dalsi_kumul := cumtrapz([0, 0.5, 1], [1, 1, 1])

soucet_identita := trapz(x, f) + trapz(x, g)
spolecne := trapz(x, f + g)

s_jednotkami := trapz([0, 2, 5] s, [0, 4, 10] N)

check "konstantní funkce": abs(konstanta - 10) < 1e-13
check "lichoběžník je additivní": abs(soucet_identita - spolecne) < 1e-12
check "kumulace konstanty": sum(kumul) == 20 and kumul[3] == 3
check "kumulace na hustší síti": sum(dalsi_kumul) == 1.5
check "lichoběžník konvexní funkci nadhodnotí": chyba > 0
check "práce s jednotkami": abs(s_jednotkami / 25 N·s - 1) < 1e-13
