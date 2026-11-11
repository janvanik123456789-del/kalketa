# Plovoucí čárka – odečtení blízkých čísel a součet řady

"Odečtení dvou téměř stejných čísel: výsledek má méně platných číslic než vstup."
blizke := (1.0 + 1e-15) - 1.0
"dvojnásobná přesnost: mez, pod kterou se reziduum odečítání již neprokáže, je 8·ε ≈ 1,8e-15."
epsilon := 2.220446049250313e-16
meze := 8·epsilon
check "Reziduum je pod mezní přesností": abs(blizke) < meze
"Druhý pár: rozdíl 1e-13 je ještě pod dvojnásobnou mezní přesností."
blizke2 := (1.0 + 1e-13) - 1.0
check "Druhý reziduum": abs(blizke2 - 1e-13) < 1e-13
"Řada 1/k² do deseti tisíc členů: součet leží mezi π²/6 − 1/n a π²/6 − 1/(n+1) (integrál test)."
S := sum(1/k², k: 1 .. 10000)
S_konec := π²/6
check "Odhad shora": S < S_konec - 1/10001
check "Odhad zespoda": S > S_konec - 1/10000
"Odečtení řady od její limity ukazuje velikost zbytku řádu 1e-4."
zbytek := S_konec - S
check "Zbytek je 1e-4": abs(zbytek - 1e-4) < 1e-8
