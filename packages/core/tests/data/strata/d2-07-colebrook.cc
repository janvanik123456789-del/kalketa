# Colebrookova rovnice – třecí součinitel

Re := 1e5                     ' Reynoldsovo číslo
rel := 1e-4                   ' relativní drsnost ε/D
"Colebrookova rovnice pro λ, řešič pracuje s převrácenou hodnotou odmocniny."
solve lam: 1/sqrt(lam) == -2·log10(rel/3.7 + 2.51/(Re·sqrt(lam))) in 0.005 .. 0.1
"Kontrola dosazením do obou stran rovnice."
leva := 1/sqrt(lam)
prava := -2·log10(rel/3.7 + 2.51/(Re·sqrt(lam)))
check "Colebrookova rovnice sedí": abs(leva - prava) < 1e-9
check "λ je v turbulentním rozsahu": lam > 0.005
"Stejné řešení z explicitního Swameeho–Jaina vztahu; ten má vlastní záměrnou chybu řádu 1 %."
lam_sj := 0.25/(log10(rel/3.7 + 5.74/Re^0.9))^2
check "Explicitní vztah souhlasí do 1 %": abs(lam_sj - lam)/lam < 0.01
