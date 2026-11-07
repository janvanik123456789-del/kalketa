# Posouzení prostorové napjatosti podle hypotéz HMH a Guesta
"Podle příkladu 9.1 z učebnice Pružnost a pevnost (VŠB-TU Ostrava, R. Halama a kol.). V bodě tělesa jsou dány složky tenzoru napětí. Určíme hlavní napětí a z nich redukované napětí podle hypotézy HMH (energie změny tvaru) a podle Guestovy hypotézy (největší smykové napětí) a porovnáme je s dovoleným napětím. Zdroj nepíše, jak hlavní napětí číslovat; používáme pořadí σ₁ ≤ σ₂ ≤ σ₃ (nejmenší, prostřední, největší). Obrázky jsou vlastní."
"Zdroj: https://mi21.vsb.cz/sites/mi21.vsb.cz/files/unit/pruznost_a_pevnost.pdf"

## Zadání
σ_x := 80 MPa         ' normálové napětí ve směru x
σ_y := 20 MPa         ' normálové napětí ve směru y
σ_z := -15 MPa        ' normálové napětí ve směru z (tlak)
τ_xy := 40 MPa        ' smykové napětí v rovině xy
τ_yz := 0 MPa
τ_zx := 0 MPa
σ_DOV := 112 MPa      ' dovolené napětí
![Element s napětími σ_x, σ_y, σ_z a τ_xy a tři Mohrovy kružnice prostorové napjatosti](images/mohr.svg){width=90%}

## Hlavní napětí
"Hlavní napětí jsou vlastní čísla tenzoru napětí, tedy kořeny rovnice det(T − σ·E) = 0:"
T := [σ_x, τ_xy, τ_zx | τ_xy, σ_y, τ_yz | τ_zx, τ_yz, σ_z]
σ := eigenvals(T)
"Totéž jako na papíře: protože τ_yz = τ_zx = 0, je σ_z hlavní napětí a zbylá dvě dá rovinná napjatost v rovině xy:"
σ_23 := (σ_x + σ_y)/2 ± sqrt((σ_x - σ_y)^2/4 + τ_xy^2)
σ_1 := min(σ)
σ_3 := max(σ)
σ_2 := sum(σ) - σ_1 - σ_3
"Zdroj čísluje stejná napětí jinak (−15, 100, 0 MPa); na výsledek to nemá vliv, oba vzorce níže jsou souměrné."

## Mohrovy kružnice
"Tři kružnice mají průměry rovné rozdílům hlavních napětí; největší smykové napětí je poloměr největší z nich:"
τ_12 := abs(σ_1 - σ_2)/2
τ_23 := abs(σ_2 - σ_3)/2
τ_31 := abs(σ_3 - σ_1)/2
τ_max := max(τ_12, τ_23, τ_31)

## Redukovaná napětí
"Hypotéza HMH: redukované napětí je jednoosé napětí, které má stejnou energii změny tvaru jako daná napjatost:"
σ_RED_HMH := sqrt(σ_1^2 + σ_2^2 + σ_3^2 - σ_1·σ_2 - σ_2·σ_3 - σ_3·σ_1) {eq}
"Guestova hypotéza: rozhoduje největší smykové napětí, redukované napětí je jeho dvojnásobek:"
σ_RED_GUEST := max(abs(σ_1 - σ_2), abs(σ_2 - σ_3), abs(σ_3 - σ_1)) {eq}
"Nezávislá kontrola HMH bez hlavních napětí, přímo ze složek tenzoru (platí pro libovolné složky):"
σ_RED_HMH2 := sqrt(σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x + 3·(τ_xy^2 + τ_yz^2 + τ_zx^2))
"Využití dovoleného napětí:"
v_HMH := σ_RED_HMH/σ_DOV | %
v_GUEST := σ_RED_GUEST/σ_DOV | %

## Posudky
check "Redukované napětí HMH (v kontrole stejné přímo ze složek)": σ_RED_HMH ≤ σ_DOV and abs(σ_RED_HMH - σ_RED_HMH2) ≤ 0.001 MPa
check "Redukované napětí podle Guesta": σ_RED_GUEST ≤ σ_DOV

## Jak závisí posudek na smykovém napětí
"Ostatní složky necháme a měníme jen smykové napětí τ, abychom viděli, kdy která hypotéza selže. Obě redukovaná napětí jako funkce τ (hlavní napětí v rovině xy jsou a a b, třetí je dál σ_z):"
σ_HMH(τ) := sqrt(σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x + 3·τ^2)
a(τ) := (σ_x + σ_y)/2 + sqrt((σ_x - σ_y)^2/4 + τ^2)
b(τ) := (σ_x + σ_y)/2 - sqrt((σ_x - σ_y)^2/4 + τ^2)
σ_GUEST(τ) := max(abs(a(τ) - b(τ)), abs(b(τ) - σ_z), abs(σ_z - a(τ)))
plot(σ_HMH(τ), σ_GUEST(τ), τ: 0 MPa .. 60 MPa, title: "Redukovaná napětí podle smykového napětí τ_xy") | MPa
"Největší smykové napětí, které napjatost ještě unese. U HMH z podmínky σ_HMH = σ_DOV, u Guesta rozhoduje rozdíl a − σ_z (největší a nejmenší hlavní napětí):"
τ_dov_HMH := sqrt((σ_DOV^2 - (σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x))/3) | MPa
τ_dov_GUEST := sqrt((σ_DOV + σ_z - (σ_x + σ_y)/2)^2 - ((σ_x - σ_y)/2)^2) | MPa
check "Zadané smykové napětí je pod mezí HMH, ale nad mezí Guesta": τ_dov_GUEST < τ_xy and τ_xy < τ_dov_HMH
"Guestova hypotéza je přísnější: vždy dá aspoň tolik jako HMH, a proto snese menší smykové napětí (asi 36 MPa proti 43 MPa). Zadané τ_xy = 40 MPa leží mezi nimi."
"Napjatost tedy vyhovuje podle HMH (využití 96,7 %), ale podle Guesta ne (102,7 %). Který posudek použít, určuje norma nebo materiál: HMH sedí na tvárné kovy lépe, Guest je bezpečnější odhad."
