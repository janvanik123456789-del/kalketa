# Reakce, momenty a průhyb spojitého nosníku o dvou polích
"Vlastní zadání: stropní nosník z válcovaného profilu IPE 300 leží na třech podporách. Přes obě pole nese rovnoměrné zatížení, uprostřed delšího pole na něj navíc působí osamělá síla od příčného průvlaku. Nosník je jednou staticky neurčitý. Kalketa ho spočítá funkcí beam a výsledek se ověří ručně rovnicí tří momentů. Obrázek je vlastní."
"Zdroj: vlastní zadání, ověřeno rovnicí tří momentů (oddíl 4 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
L_1 := 6 m
L_2 := 4.5 m
L := L_1 + L_2
q := 12 kN/m             ' rovnoměrné zatížení přes obě pole
F := 30 kN               ' osamělá síla od průvlaku
a := 3 m                 ' poloha síly od levé podpory
E := 210 GPa
f_y := 235 MPa           ' ocel S235
"Předpokládáme stálý průřez po celé délce, zatížení bez dílčích součinitelů a nosník zajištěný proti klopení. Vlastní tíha je v zatížení q."
![Nosník o dvou polích na třech podporách se spojitým zatížením q a silou F](images/nosnik.svg){width=80%}

## Průřez
"Průřezové charakteristiky spočítá i_section z rozměrů profilu včetně zaoblení. Tabulkové hodnoty porovnáme v posudcích."
prurez := i_section(300 mm, 150 mm, 7.1 mm, 10.7 mm, 15 mm)
I := prurez.I_y
W := prurez.W_y

## Výpočet nosníku
"Funkce beam počítá deformační metodou, přesně a bez sítě. Reakce kladné nahoru, moment kladný s tahem dole, průhyb kladný dolů."
nosnik := beam(L: L, EI: E·I, pins: [0 m, L_1, L], q: q, at: [a], F: [F])
R_A := nosnik.R[1] | kN
R_B := nosnik.R[2] | kN
R_C := nosnik.R[3] | kN
M_max := nosnik.M_max | kN·m
M_min := nosnik.M_min | kN·m
V_max := nosnik.V_max | kN
w_max := nosnik.w_max | mm
plot(beam_M(nosnik, x), x: 0 m .. L, title: "Ohybový moment") | kN·m
plot(beam_w(nosnik, x), x: 0 m .. L, title: "Průhyb") | mm

## Ruční kontrola rovnicí tří momentů
"Krajní podpory nepřenášejí moment, proto v rovnici zůstane jen moment nad střední podporou. Pravá strana je součet členů od zatížení obou polí a od síly F."
Σ_q := q·L_1^3/4 + q·L_2^3/4 + F·a·(L_1^2 - a^2)/L_1 | kN·m^2
M_B := -Σ_q/(2·(L_1 + L_2)) | kN·m
R_A_ruka := q·L_1/2 + F·(L_1 - a)/L_1 + M_B/L_1 | kN
M_pod_F := R_A_ruka·a - q·a^2/2 | kN·m

## Posudky
σ := max(abs(M_max), abs(M_min))/W | MPa
w_lim := L_1/250 | mm
check "Svislá rovnováha": abs(R_A + R_B + R_C - q·L - F) ≤ 0.001 kN
check "Moment nad podporou jako z rovnice tří momentů": abs(M_min - M_B) ≤ 0.001 kN·m
check "Největší moment pod silou F jako z ruční rovnováhy": abs(M_max - M_pod_F) ≤ 0.001 kN·m
check "Průřez jako v tabulkách IPE 300 (8 356 cm⁴, 557 cm³, do 1 %)": abs(I - 8356 cm^4) ≤ 0.01·8356 cm^4 and abs(W - 557 cm^3) ≤ 0.01·557 cm^3
check "Napětí nepřekročí mez kluzu": σ ≤ f_y
check "Průhyb nejvýše L_1/250": w_max ≤ w_lim
"Největší moment 67,4 kN·m je pod silou F, nad střední podporou je moment −63,2 kN·m a napětí je tam jen o málo menší. Průřez vyhoví na napětí i průhyb s rezervou, takže by šlo uvažovat o menším profilu."
