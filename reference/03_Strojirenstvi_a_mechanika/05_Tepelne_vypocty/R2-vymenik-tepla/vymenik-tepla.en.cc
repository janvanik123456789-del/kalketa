# Length of a double-pipe heat exchanger: counterflow or parallel flow
"After the examples of the course ME302 Heat Transfer (Rose-Hulman Institute of Technology), heat exchangers, two solved examples. Geothermal water at 160 °C heats service water from 20 °C to 80 °C in a double-pipe heat exchanger. The inner pipe is thin-walled, 1.5 cm in diameter, with an overall heat transfer coefficient of 640 W/(m²·K). How long must the exchanger be when the two fluids flow against each other (counterflow), and how long when they flow in the same direction (parallel flow)? Both arrangements are variants of the calculation. The picture is our own."
"Source: https://rose-hulman.edu/~adams1/courses/me302/lessons/Examples_HXRs_soln.pdf"

## Input
m_c := 1.2 kg/s               ' heated water
t_c1 := 20 °C
t_c2 := 80 °C
c_c := 4189 J/(kg·K)
m_h := 2 kg/s                 ' geothermal water
t_h1 := 160 °C
c_h := 4342 J/(kg·K)
D := 1.5 cm                   ' diameter of the inner pipe
k := 640 W/(m^2·K)            ' overall heat transfer coefficient
![Double-pipe heat exchanger: cold water in the inner pipe, hot water in the annulus, at the top against each other, at the bottom in the same direction](images/vymenik.en.svg){width=85%}

## Heat balance
"The heat taken up by the heated water is given off by the geothermal water. The arrangement of the streams does not matter:"
Q := m_c·c_c·(t_c2 - t_c1) | kW {eq}
t_h2 := t_h1 - Q/(m_h·c_h) | °C {eq}

## Log mean temperature difference
"The arrangement decides with what temperature of the cold water the hot water meets at its inlet (end A) and at its outlet (end B). In counterflow the entering hot water meets the already heated cold water, in parallel flow the cold water at its inlet:"
table Usporadani: {variants=protiproud}
    | proudeni   | t_cA [°C] | t_cB [°C] |
    | protiproud | 80        | 20        |
    | souproud   | 20        | 80        |
ΔT_A := t_h1 - t_cA | K
ΔT_B := t_h2 - t_cB | K
ΔT_ln := (ΔT_A - ΔT_B)/ln(ΔT_A/ΔT_B) | K {eq}

## Area and length
A := Q/(k·ΔT_ln) | m^2 {eq}
L := A/(π·D) | m {eq}
"Source: counterflow 92 °C, 5.13 m² and 109 m; parallel flow 83.7 °C, 5.64 m² and 120 m. The source works with the outlet temperature rounded to 125 °C and the heat 302 kW, so it differs in the tenths."

## Comparison of the arrangements
porovnani := compare(Usporadani, ΔT_ln, A, L)
"Counterflow has the larger mean temperature difference. It therefore transfers the same heat on an area 9 % smaller and the exchanger is 11 m shorter. In counterflow the cold water can leave warmer than the hot water at the outlet; in parallel flow never."
