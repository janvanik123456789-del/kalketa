# Resistance of an NTC thermistor between the points of a catalogue table: interpolation and the B model
"The catalogue of a 10 kΩ NTC thermistor gives the resistance every 10 °C. We need the resistance at a temperature between the points of the table. We compare interpolation by a broken line, by a cubic spline and by pchip (shortcuts as in MATLAB) with a calculation from the B model of the thermistor. The table was calculated from the B model (R_25 = 10 kΩ, B = 3950 K) and rounded to 4 significant digits as in catalogues, so the exact value is known and the error of each method can be calculated."

## Table from the catalogue
table NTC: {across}
    | T [°C] {0} | R [kΩ] {0.000} |
    | 0          | 33.62          |
    | 10         | 20.17          |
    | 20         | 12.54          |
    | 30         | 8.037          |
    | 40         | 5.301          |
    | 50         | 3.588          |
    | 60         | 2.486          |
    | 70         | 1.76           |
    | 80         | 1.27           |
    | 90         | 0.9336         |
    | 100        | 0.6975         |
T_1 := 37 °C                    ' temperature for which we look for the resistance

## Interpolation between the points
"The broken line joins neighbouring points by a straight segment, the cubic spline leads a smooth curve through the points (continuous first and second derivative), pchip is a cubic that keeps the shape of the data and does not overshoot between the points:"
R_lin := interp1(NTC.T, NTC.R, T_1) | kΩ
R_spl := spline(NTC.T, NTC.R, T_1) | kΩ
R_pch := pchip(NTC.T, NTC.R, T_1) | kΩ

## B model of the thermistor
"The resistance of an NTC falls exponentially with temperature, R = R_25·e^(B·(1/T − 1/T_25)), with the thermodynamic temperature T in kelvins. We therefore convert the temperatures to K. The constant B is found from the end points of the table (catalogues give it this way as B_0/100):"
T_0 := NTC.T[1] | K
T_100 := NTC.T[11] | K
B_0100 := ln(NTC.R[1]/NTC.R[11])/(1/T_0 - 1/T_100) | K
T_1K := T_1 | K
R_B := NTC.R[1]·exp(B_0100·(1/T_1K - 1/T_0)) | kΩ
"The exact value from the model from which the table was calculated:"
R_25 := 10 kΩ
B := 3950 K
T_25 := 25 °C | K
R_ex(T) := R_25·exp(B·(1/T - 1/T_25))
R_1 := R_ex(T_1K) | kΩ

## Errors of the methods
"Relative error of the broken line (δ_1), of the spline (δ_2), of pchip (δ_3) and of the model with B from the table (δ_4) against the exact value:"
δ_1 := R_lin/R_1 - 1 | %
δ_2 := R_spl/R_1 - 1 | %
δ_3 := R_pch/R_1 - 1 | %
δ_4 := R_B/R_1 - 1 | %
check "spline within 0.1 %": abs(δ_2) < 0.1 %
check "broken line is not good to 1 %": abs(δ_1) > 1 %
"Error over the whole range of the table: between the points the broken line always lies above the curve (which is convex), spline and pchip deviate from it only slightly, and at the points of the table the error is given only by the rounding of the catalogue."
δ_lin(T) := interp1(NTC.T, NTC.R, T)/R_ex(T) - 1
δ_spl(T) := spline(NTC.T, NTC.R, T)/R_ex(T) - 1
δ_pch(T) := pchip(NTC.T, NTC.R, T)/R_ex(T) - 1
plot(δ_lin(T), δ_spl(T), δ_pch(T), T: T_0 .. T_100, title: "Interpolation error against the B model (temperature in K)") | %
