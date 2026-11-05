# Uncertainty of the power in a resistor by the Monte Carlo method
"Own task: a voltage of 230 V with a standard uncertainty of 3 V (normal distribution) is applied to a resistor. The resistance is 52 Ω with a tolerance of ±2 Ω, and every value inside the tolerance is taken as equally likely. We look for the power P = U²/R and its uncertainty, calculated three ways: by the linear propagation of GUM, by a Monte Carlo simulation and exactly from the moments of the distributions."
"Source: own task following JCGM 100 (GUM) and JCGM 101 (Supplement 1, Monte Carlo), verified by the exact moments (section 4 of the sheet) and independently in Python (Check in Python layer)."

## Input
U_0 := 230 V             ' voltage
u_U := 3 V               ' its standard uncertainty
R_0 := 52 Ω              ' nominal resistance
a_R := 2 Ω               ' half the tolerance of the resistance
n := 5000                ' number of trials of the simulation

## Linear propagation of uncertainty (GUM)
"A rectangular distribution of half-width a has the standard uncertainty a/√3. The sensitivities are the partial derivatives of the power by the voltage and by the resistance at the nominal point."
P_0 := U_0^2/R_0 | W
u_R := a_R/sqrt(3) | Ω
c_U := 2·U_0/R_0 | W/V
c_R := -U_0^2/R_0^2 | W/Ω
u_P := sqrt((c_U·u_U)^2 + (c_R·u_R)^2) | W

## Monte Carlo simulation
"In each trial a voltage and a resistance are drawn and the power is calculated. The seeds 1 and 2 make the simulation repeatable, so the sheet shows the same numbers every time it is opened and can be checked. The 95 % interval lies between the 2.5 % and 97.5 % quantiles."
U_s := rndn(n, 1, U_0, u_U)
R_s := rnd(n, 2, R_0 - a_R, R_0 + a_R)
P_s := U_s^2/R_s
P_mc := mean(P_s) | W
u_mc := stdev(P_s) | W
P_lo := quantile(P_s, 0.025) | W
P_hi := quantile(P_s, 0.975) | W
plot(P_s, kind: "hist", bins: 40, title: "Distribution of the power from the simulation") | W

## Exact moments
"U and R are independent, so the mean of the product is the product of the means: E[P] = E[U²]·E[1/R]. Both means can be calculated exactly, for the rectangular distribution by the integral of 1/R over the tolerance."
E_U2 := U_0^2 + u_U^2 | V^2
E_U4 := U_0^4 + 6·U_0^2·u_U^2 + 3·u_U^4 | V^4
E_R1 := ln((R_0 + a_R)/(R_0 - a_R))/(2·a_R) | 1/Ω
E_R2 := (1/(R_0 - a_R) - 1/(R_0 + a_R))/(2·a_R) | 1/Ω^2
P_e := E_U2·E_R1 | W
u_e := sqrt(E_U4·E_R2 - P_e^2) | W

## Checks
check "Mean from the simulation as the exact one, within the scatter of the simulation": abs(P_mc - P_e) ≤ 3·u_e/sqrt(n)
check "Uncertainty from the simulation as the exact one, within 2 %": abs(u_mc - u_e) ≤ 0.02·u_e
check "Linear estimate of GUM as the exact uncertainty, within 1 %": abs(u_P - u_e) ≤ 0.01·u_e
check "95 % interval from the simulation as P_0 ± 2·u_P, within 1 %": abs(P_lo - (P_0 - 2·u_P)) ≤ 0.01·P_0 and abs(P_hi - (P_0 + 2·u_P)) ≤ 0.01·P_0
"The power is 1017 W with a standard uncertainty of 35 W. All three ways agree here because the uncertainties are small against the values and the model is nearly linear over their range. The mean power is less than a watt above the power at the nominal point. A simulation pays off when the model curves more: then the linear estimate distorts the interval and the simulation does not."
