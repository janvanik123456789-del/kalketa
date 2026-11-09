# Zátěžový test E — odvození, přesný tvar, tisk, citace
"Ověřuje, že list odvození opravdu kontroluje (nejen hezky sází), drží sliby dané tiskovými volbami a hlídá čísla a citace v textu."

## E1 — odvození, která platí
q_E := 12 kN/m
L_E := 5 m
E_E := 210 GPa
"M_Ed krok za krokem — každý krok se má ověřit:"
M_Ed := q_E·L_E^2/8 == q_E·L_E·L_E/8 == 37.5 kN·m
relation x_E^2 + y_E^2 == r_E^2 {eq=KruhE}
r_E := 5
x_E := 3
solve y_E ∈ ℝ, y_E > 0: KruhE      ' OČ: 4
gamma_E := 0.02
derive sin(gamma_E) ≐ gamma_E      ' OČ: ověření se zmenšenými značkami projde

## E2 — odvození, která neplatí (list je má chytit)
spatne_1 := q_E·L_E == q_E·L_E^2   ' OČ: chyba — kroky mají jiný rozměr
derive q_E·1 m == q_E·L_E          ' OČ: chyba — 1 m není L_E, obecně to neplatí
derive q_E·L_E == q_E·L_E/2        ' OČ: chyba — obecně to neplatí

## E3 — přesné hodnoty a zaokrouhlení
presne := (49/9) s^-2 {exact}      ' OČ: zlomek 49/9 se má ukázat přesně
odmocnina := sqrt(12 m^2) {exact}  ' OČ: 2√3 m
kol := 1.005 s + 1.005 s {decimals=2 rounded}   ' OČ: 2.01 s, sčítají se zaokrouhlené hodnoty
bez_rounded := 1.005 s + 1.005 s {decimals=2}   ' OČ: výsledek se počítá ze skutečných hodnot

## E4 — tiskové direktivy a pozice
"Direktivy stojí na samostatném řádku — na konci řádku je program nezná:"
@hide
skryty := 2·q_E                    ' OČ: spočítá, netiskne
@result
jen_vystup := 4 m                  ' OČ: netiskne se dosazení
## První pozice {pos}
F_P := 10 kN
A_P := F_P/2
## Druhá pozice {pos}
B_P := 2 kN
C_P := B_P + Pos1.A_P              ' OČ: 7 kN, jméno z první pozice se bere přes Popis pozice
"Odkaz na rovnici v textu: (#KruhE)"

## E5 — posuvník a funkce
a_s := 2 {slider=-5..5}
b_s := 3
y_s(x) := a_s·x^2 + b_s·x
x_v := solve x_p: y_s′(x_p) == 0   ' OČ: vrchol paraboly, −b/(2a)
x_v_ruka := -b_s/(2·a_s)
check "Vrchol z solve sedí na ruční vzorec": abs(x_v - x_v_ruka) ≤ 1e-9
k_podm := if(a_s > 0, 1, -1)
plot(y_s(x), x: -5 .. 5, extremes: true)

## E6 — text, který list musí hlídat
"Věta s číslem, které list nikde nedefinoval: čas je 1,034 s."
"Věta se jménem veličiny: moment je M_Ed."
"Věta s cizí citací, kterou list nezná: to je tak." [XX:T9]