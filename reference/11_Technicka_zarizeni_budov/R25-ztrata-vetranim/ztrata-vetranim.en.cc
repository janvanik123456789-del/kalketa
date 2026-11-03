# Ventilation heat loss of a family house with heat recovery according to ČSN EN 12831-1
"After an example from an article in a Czech journal on heating and ventilation (VVI 2/2021, CTU in Prague; authors and title in the source below). A single-storey family house on the edge of Prague, a family of four, forced balanced ventilation by a unit with heat recovery (HR). We calculate the ventilation heat loss of each room by the universal procedure of the standard: ventilation through the building envelope (infiltration), forced ventilation (the air behind the recovery unit is colder than the room) and air transfer (a bathroom heated to 24 °C draws air from the surrounding rooms). The diagram is our own, the theory is in the Sources layer."
"Source: V. Zmrhal, J. Boháč: Tepelná ztráta větráním podle ČSN EN 12831-1, Vytápění, větrání, instalace 2/2021, http://users.fs.cvut.cz/~zmrhavla/Publikace/2021/Zmrhal_02_2021.pdf"

## Input
t_e := -15 °C                 ' outdoor design temperature, Prague (ČSN EN 12831-1, NA.1)
t_i := 20 °C                  ' prevailing indoor temperature
t_k := 24 °C                  ' bathroom
V_b := 298 m^3                ' internal air volume of the house (sum of the rooms)
A_env := 359.9 m^2            ' area of the house envelope from internal dimensions (ČSN EN ISO 9972)
n_50 := 1.5 h^-1               ' air change rate at 50 Pa (chosen, forced ventilation according to ČSN 73 0540-2)
V_sup := 135 m^3/h            ' outdoor air supplied by the unit
V_exh := 135 m^3/h            ' air extracted by the unit
η_rec := 0.8                  ' temperature factor of the HR (manufacturer)
![Balanced ventilation with heat recovery: supply to living rooms, extract from the kitchen, WC and bathroom, air transferred through the corridor, infiltration through the envelope](images/vetrani.en.svg){width=90%}
"Factors according to the standard (annex B): orientation of the zone, volume flow and unbalanced ventilation; air at 20 °C."
f_dir := 2
f_qv := 0.03
f_e := 1                      ' balanced ventilation
ρc := 1.2 kg/m^3·0.28 W·h/(kg·K) | W·h/(m^3·K)

## The house as a zone: infiltration and the air behind the recovery unit
"The specific air permeability of the envelope at 50 Pa from the chosen air change rate n_50. The source gives 1.33 m³/(h·m²); from the room volume of 298 m³ it comes out 1.24, so the source apparently used a larger internal volume (with the partitions). We go on with the value of the source so that the results can be compared."
V_50 := n_50·V_b/A_env | m^3/(h·m^2)
V_50z := 1.33 m^3/(h·m^2)     ' value of the source
"Additional infiltration and the air that gets into the house through the envelope (the unit supplies and extracts the same amount, no underpressure arises):"
V_inf := V_50z·A_env·f_qv·f_e | m^3/h {eq}
V_env := max(V_exh - V_sup, 0 m^3/h) + V_inf | m^3/h {eq}
"Temperature of the air behind the HR exchanger (the extracted air is at 20 °C):"
t_rec := t_e + η_rec·(t_i - t_e) | °C {eq}

## Living room in detail
"The procedure for one room as the source shows it: the minimum flow, air through the envelope in proportion to the area of the room envelope, air for technical systems, and from them the three parts of the loss."
V_1 := 97.2 m^3
a_1 := 120.7 m^2              ' envelope of the room including the floor
V_min1 := 0.5 h^-1·V_1 | m^3/h
V_leak1 := V_inf·a_1/A_env | m^3/h
V_env1 := min(V_env, f_dir·V_leak1) | m^3/h
V_tech1 := max(55 m^3/h + 0 m^3/h, 40 m^3/h) | m^3/h
Q_env1 := max(V_env1, V_min1 - V_tech1)·ρc·(t_i - t_e) | W {eq}
Q_sup1 := 55 m^3/h·ρc·(t_i - t_rec) | W {eq}
Q_V1 := Q_env1 + Q_sup1 | W
"Forced ventilation covers more than the minimum flow (55 > 48.6 m³/h), so through the envelope we count only the actual infiltration; the supplied air is at 13 °C and the room has to reheat it."

## All rooms
"The source does not give the room envelope areas (except for the living room); they are worked out from its table of flows. Their sum of 360.1 m² agrees with the envelope area of the house. The air transferred from the surrounding rooms is at 20 °C, it gives a loss only in the bathroom heated to 24 °C."
t_tr := 20 °C
"The loss through the envelope of one room as a function of its data, so that the formula in the table header stays short: the higher of the infiltration and of the missing minimum ventilation."
q_env(V, t, n, p, o, r, a) := max(min(V_env, f_dir·V_inf·a/A_env), n·V - max(p + r, o))·ρc·(t - t_e)
table Mistnosti:
    | mistnost       | V [m³] | t [°C] | n [h⁻¹] | p [m³/h] | o [m³/h] | r [m³/h] | a [m²] | Q_env [W] {0} = q_env(V, t, n, p, o, r, a) | Q_sup [W] {0} = p·ρc·(t - t_rec) | Q_tr [W] {0} = r·ρc·(t - t_tr) | Q [W] {0} = Q_env + Q_sup + Q_tr |
    | living + kit. | 97.2   | 20     | 0.5     | 55       | 40       | 0        | 120.7  |   |   |   |   |
    | WC             | 5.7    | 20     | 0       | 0        | 25       | 25       | 5.0    |   |   |   |   |
    | lobby          | 22.7   | 20     | 0.5     | 0        | 10       | 10       | 26.3   |   |   |   |   |
    | bedroom        | 32.4   | 20     | 0.5     | 40       | 0        | 0        | 35.1   |   |   |   |   |
    | room 1         | 34.6   | 20     | 0.5     | 20       | 0        | 0        | 51.4   |   |   |   |   |
    | room 2         | 34.0   | 20     | 0.5     | 20       | 0        | 0        | 43.9   |   |   |   |   |
    | bathroom, WC   | 24.8   | 24     | 0.5     | 0        | 50       | 50       | 28.8   |   |   |   |   |
    | utility room   | 13.2   | 20     | 0.5     | 0        | 10       | 10       | 16.3   |   |   |   |   |
    | pantry         | 8.4    | 20     | 0       | 0        | 0        | 0        | 11.3   |   |   |   |   |
    | corridor       | 25.4   | 20     | 0       | 0        | 0        | 0        | 21.3   |   |   |   |   |
    | Total          |        |        |         | Σ        | Σ        |          | Σ      | Σ | Σ | Σ | Σ |
"Columns: V volume, t indoor temperature, n minimum ventilation rate, p supply, o extract, r air transferred from the surroundings, a area of the room envelope."

## Result
Q_env := sum(Mistnosti.Q_env) | W
Q_sup := sum(Mistnosti.Q_sup) | W
Q_tr := sum(Mistnosti.Q_tr) | W
Q_V := sum(Mistnosti.Q) | W
check "Agreement with the source (725 W)": abs(Q_V - 725 W) ≤ 5 W   source "VVI 2/2021, table 5"
check "Balanced ventilation": abs(sum(Mistnosti.p) - sum(Mistnosti.o)) ≤ 1 m^3/h
"Without recovery the supplied air would be heated from −15 °C and the loss by forced ventilation would be:"
Q_sup0 := V_sup·ρc·(t_i - t_e) | W
ΔQ := Q_sup0 - Q_sup | W
