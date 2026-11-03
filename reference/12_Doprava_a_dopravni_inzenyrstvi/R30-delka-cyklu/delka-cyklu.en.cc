# Optimal cycle length of a traffic signal (Webster)
"After the example Cycle Length Determination from the NIATT Traffic Signal Timing Lab Manual (National Institute for Advanced Transportation Technology, University of Idaho). The intersection is controlled in three phases. For each phase we know the ratio of the critical flow to the saturation flow and the intergreen time. The cycle length is determined by Webster’s formula, which gives the smallest delay of vehicles. The split of the green among the phases is our addition, following Webster’s rule of equal degree of saturation. The picture is our own."
"Source: https://www.webpages.uidaho.edu/niatt_labmanual/Chapters/signaltimingdesign/exampleproblems/CycleLengthDetermination.htm"

## Input
"Phases: y is the ratio of the critical flow to the saturation flow, I the intergreen time between the end of the green of one phase and the start of the next."
table Faze:
    | faze | y     | I [s] |
    | 1    | 0.233 | 6     |
    | 2    | 0.13  | 4     |
    | 3    | 0.256 | 7     |
![Cycle of a signal with three phases: effective greens g_1 to g_3 separated by intergreen times I_1 to I_3](images/cyklus.en.svg){width=85%}

## Cycle length
"The lost time of the cycle is the sum of the intergreen times, Y the sum of the critical ratios:"
L_z := sum(Faze.I) | s
Y := sum(Faze.y)
C_o := (1.5·L_z + 5 s)/(1 - Y) | s {eq}
"The cycle length is rounded to whole five seconds:"
C_n := round(C_o/(5 s))·5 s | s
"If all critical ratios were close to zero, the denominator would be 1 and the cycle the shortest:"
C_min := 1.5·L_z + 5 s | s
"Source: 80 s, and 31 s for zero ratios."

## Split of the green
"The green is divided in proportion to the critical ratios of the phases, so all phases have the same degree of saturation:"
g_e := Faze.y/Y·(C_n - L_z) | s
X := Y·C_n/(C_n - L_z)
check "Greens and intergreens fill the cycle": abs(sum(g_e) + L_z - C_n) ≤ 0.01 s
"A degree of saturation of 0.87 leaves a reserve of 13 %. With Y close to 1 the cycle would grow beyond all bounds:"
C_Y(x) := (1.5·L_z + 5 s)/(1 - x)
plot(C_Y(x), x: 0 .. 0.85, title: "Optimal cycle length against the sum of critical ratios Y") | s
