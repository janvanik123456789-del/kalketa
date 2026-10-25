# Výpočet rajónu: souřadnice nového bodu v S-JTSK
"Podle vzorového výpočtu Souřadnicové výpočty – výpočet rajónu (Přírodovědecká fakulta Univerzity Karlovy). Na daném bodě 517 byl teodolitem změřen vodorovný směr na daný bod 518 (orientace) a na nový bod 550 a délka k němu. Souřadnice bodu 550 určíme ze směrníku orientace, vrcholového úhlu a délky. V S-JTSK míří osa X k jihu a osa Y k západu, úhly se měří v gradech (gon, pravý úhel je 100 gon). Náčrt je vlastní."

## Zadání
Y_517 := 668249.55 m
X_517 := 1119008.31 m
Y_518 := 668625.06 m
X_518 := 1120260.63 m
"Měřené směry na stanovisku 517 a délka převedená do zobrazení S-JTSK:"
ψ_518 := 82.0285 gon
ψ_550 := 189.2487 gon
d_550 := 286.45 m
![Rajón: z bodu 517 orientace na bod 518 se směrníkem σ, vrcholový úhel ω a délka d k novému bodu 550; osa X k jihu, Y k západu](images/rajon.svg){width=60%}

## Směrník a úhel
"Směrník je úhel od kladné osy X po směr na bod, ve směru hodinových ručiček, 0 až 400 gon:"
σ := mod(atan2(Y_518 - Y_517, X_518 - X_517), 2·π) | gon {eq}
ω := ψ_550 - ψ_518 | gon {eq}
α := σ + ω | gon {eq}

## Souřadnice nového bodu
Y_550 := Y_517 + d_550·sin(α) | m {decimals=2}
X_550 := X_517 + d_550·cos(α) | m {decimals=2}
check "Souřadnice jako ve zdroji (668 512,86; 1 118 895,51)": abs(Y_550 - 668512.86 m) ≤ 0.005 m and abs(X_550 - 1118895.51 m) ≤ 0.005 m
"Ve zdroji je u výpočtu X překlep 268,45 m místo 286,45 m; dosazené přírůstky odpovídají délce 286,45 m."
