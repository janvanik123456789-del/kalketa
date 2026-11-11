# Tlaková ztráta potrubí (Darcy–Weisbach)

"Voda o teplotě 20 °C proudí ocelovým potrubím; vstup v mm, l/min a cP, výsledek v kPa."
D := 25 mm                    ' světlost potrubí
L := 50 m                     ' délka potrubí
Q := 60 l/min                 ' objemový průtok
μ := 0.89 cP                  ' dynamická viskozita vody při 20 °C
ρ := 997 kg/m³                ' hustota vody při 20 °C
ε := 0.05 mm                  ' drsnost ocelového potrubí
"Rychlost proudění je průtok dělený průřezem potrubí."
v := Q/(π·D²/4) | m/s
Re := ρ·v·D/μ
check "Turbulentní proudění": Re > 4000
rel := ε/D
"Třecí součinitel z explicitního tvaru Haalandova přiblížení Colebrookovy rovnice."
λ := (1/(-1.8·log10((rel/3.7)^1.11 + 6.9/Re)))²
Δp := λ·(L/D)·ρ·v²/2 | kPa
"Výsledná tlaková ztráta je v jednotkách kPa, což u padesáti metrů potrubí odpovídá běžnému potrubnímu řádu."
check "Rozsah Δp": Δp < 1000 kPa
