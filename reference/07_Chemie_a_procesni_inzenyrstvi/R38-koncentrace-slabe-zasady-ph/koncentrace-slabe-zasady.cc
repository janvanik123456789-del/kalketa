# Koncentrace soli slabých kyselin pro zadané pH
"Podle příkladu 4, seminář 3 Cvičení z analytické chemie (VŠCHT Praha, T. Uhlíková): jaké koncentrace vodných roztoků octanu sodného CH₃COONa a kyanidu sodného NaCN, solí slabých kyselin, dají stejné pH = 8,5? Sůl slabé kyseliny se chová jako slabá zásada B; konjugovaná kyselina HB má disociační konstantu K_a. Koncentrace počítáme v mol/dm³ (1 mol/dm³ = 1 mol/l). Zjednodušený vztah porovnáme s přesným, který počítá i s autoprotolýzou vody, a doplníme zkoušku, jaké pH by kyanid o zjednodušené koncentraci doopravdy měl."
"Zdroj: https://web.vscht.cz/~uhlikovt/sem3_25_reseni.pdf"

## Zadání
pH := 8.5
K_a_oct := 1.76e-5 mol/dm^3    ' CH₃COOH (dříve mol/l)
K_a_HCN := 4.93e-10 mol/dm^3   ' HCN
K_w := 1e-14 mol^2/dm^6        ' iontový součin vody, 25 °C
c° := 1 mol/dm^3               ' standardní koncentrace, pro logaritmy

## Koncentrace oxoniových iontů
H := 10^(-pH)·c°
pK_oct := -log10(K_a_oct/c°)
pK_HCN := -log10(K_a_HCN/c°)
pK_w := -log10(K_w/c°^2)

## Zjednodušený vztah pro slabou zásadu
"pH = ½·(pK_BH⁺ + pK_w + log c(B)), kde pK_BH⁺ je pK_a konjugované kyseliny:"
c_oct0 := 10^(2·pH - pK_oct - pK_w)·c° | mol/dm^3
c_CN0 := 10^(2·pH - pK_HCN - pK_w)·c° | mol/dm^3
"Zdroj dává pro octan 1,770·10⁻² mol/dm³, protože počítá s zaokrouhleným pK = 4,754; s přesnou konstantou vychází 1,760·10⁻² mol/dm³. Pro kyanid 4,93·10⁻⁷ mol/dm³ souhlasí."

## S autoprotolýzou vody
"Z kvadratické rovnice c(B)·[H⁺]² − K_w·[H⁺] − K_a·K_w = 0 (pro tak zředěný roztok kyanidu zjednodušení neplatí):"
c_oct := (K_w·H + K_a_oct·K_w)/H^2 | mol/dm^3
c_CN := (K_w·H + K_a_HCN·K_w)/H^2 | mol/dm^3
chyba_CN := (c_CN - c_CN0)/c_CN | %
"Zdroj uvádí c(NaCN) = 3,6552·10⁻⁶ mol/dm³, což souhlasí."

## Zkouška: pH roztoku kyanidu o zjednodušené koncentraci
"Roztok o koncentraci c_CN0 by měl pH jen kolem 7,7, ne 8,5. Zdroj to ukazuje pouhým srovnáním obou koncentrací, zkoušku jsme doplnili:"
solve H_0 ∈ ℝ, H_0 > 0 mol/dm^3: c_CN0·H_0^2 - K_w·H_0 - K_a_HCN·K_w == 0
pH_CN0 := -log10(H_0/c°)
check "Octan: zjednodušení stačí (do 1 %)": abs(c_oct - c_oct0)/c_oct ≤ 1 %
check "Kyanid: zjednodušení nestačí (chyba nad 50 %)": chyba_CN > 50 %
check "Kyanid jako ve zdroji (3,6552·10⁻⁶ mol/dm³)": abs(c_CN - 3.6552e-6 mol/dm^3)/c_CN ≤ 0.1 %

"Na dosažení pH 8,5 stačí asi 1,8·10⁻² mol/dm³ octanu, ale jen 3,7·10⁻⁶ mol/dm³ kyanidu: kyanovodík je mnohem slabší kyselina, takže jeho sůl je silnější zásada. U tak zředěného roztoku kyanidu už je třeba počítat s vodou."
