# Pharmacokinetics: one-compartment model after an intravenous dose
"After Case Study 5 of the course PHA 5127 (University of Florida, College of Pharmacy, 2006, with solution). After a single intravenous dose of 300 mg and, in another trial, 750 mg, drug concentrations in blood plasma were measured at the 2nd, 13th and 24th hour. We determine the elimination constant, the biological half-life, the volume of distribution, the clearance and the area under the curve AUC. Then we verify that the drug behaves linearly in this range of doses. The picture is our own."
"Source: https://cop-main-a2-new.sites.medinfo.ufl.edu/files/2013/01/2006-CS5-5127-SOL.pdf"

## Input
table Mereni:
    | t [h] | c_300 [mg/L] | c_750 [mg/L] |
    | 2     | 30.72        | 76.8         |
    | 13    | 7.68         | 19.2         |
    | 24    | 1.92         | 4.8          |
D := 300 mg
D_2 := 750 mg
![One-compartment model: dose D into a compartment of volume V_d, elimination with constant k_e](images/kompartment.en.svg){width=60%}

## Elimination
"In a one-compartment model the concentration falls exponentially, c = c_0·e^(−k_e·t). In a semilogarithmic plot the points lie on a line; its slope is the elimination constant:"
k_e := ln(Mereni.c_300[1]/Mereni.c_300[3])/(Mereni.t[3] - Mereni.t[1]) | h^-1 {eq}
t_12 := ln(2)/k_e | h {eq}
"The concentration at time 0, by extending the line backwards:"
c_0 := Mereni.c_300[1]·exp(k_e·Mereni.t[1]) | mg/L
c(x) := c_0·exp(-k_e·x)
plot(Mereni.c_300, c(x), x: Mereni.t, title: "Plasma concentration after a dose of 300 mg") | mg/L

## Volume of distribution and clearance
V_d := D/c_0 | L {eq}
CL := k_e·V_d | L/h {eq}
AUC := D/CL | mg·h/L {eq}
"Source: k_e = 0.126 h⁻¹, V_d = 7.59 L, CL = 0.96 L/h, AUC = 312.5 mg·h/L (from CL rounded to 0.96)."
"By the trapezoidal rule from the measured points, with the tail of the curve c(24 h)/k_e, a larger AUC results:"
AUC_l := (c_0 + Mereni.c_300[1])/2·Mereni.t[1] + (Mereni.c_300[1] + Mereni.c_300[2])/2·(Mereni.t[2] - Mereni.t[1]) + (Mereni.c_300[2] + Mereni.c_300[3])/2·(Mereni.t[3] - Mereni.t[2]) + Mereni.c_300[3]/k_e | mg·h/L
"Source: 349.48 mg·h/L. The points are 11 hours apart and the exponential is curved between them, so the trapezoids overestimate the area by 11 %."

## Second dose: linearity
k_e2 := ln(Mereni.c_750[1]/Mereni.c_750[3])/(Mereni.t[3] - Mereni.t[1]) | h^-1
c_02 := Mereni.c_750[1]·exp(k_e2·Mereni.t[1]) | mg/L
V_d2 := D_2/c_02 | L
CL_2 := k_e2·V_d2 | L/h
AUC_2 := D_2/CL_2 | mg·h/L
check "The elimination constant does not depend on the dose": abs(k_e2 - k_e) ≤ 0.0001 h^-1
check "The clearance does not depend on the dose": abs(CL_2 - CL) ≤ 0.001 L/h
check "AUC grows in proportion to the dose (2.5×)": abs(AUC_2/AUC - D_2/D) ≤ 0.001
"The constants k_e, t_1/2, V_d and CL do not depend on the dose and AUC grows in proportion to the dose: the pharmacokinetics is linear in the range of 300 to 750 mg."
