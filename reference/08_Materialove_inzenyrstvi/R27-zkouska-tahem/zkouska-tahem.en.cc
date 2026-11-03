# Evaluation of a tensile test of steel 11 458
"After exercise 4 of the course Limit States of Materials (Brno University of Technology, Institute of Materials Science and Engineering, Vlach et al.; in Czech), example 2. A cylindrical test bar of steel 11 458 with threaded heads was broken in a tensile testing machine. From the recorded forces and from the dimensions of the bar before and after the test we determine the offset yield strength, the tensile strength, the reduction of area, the elongation, the tensile toughness, the resilience and the strain hardening ratio. The source gives no results; all of them were verified independently in Python. The picture is our own."
"Source: Vlach a kol.: Mezní stavy materiálu, cvičení 4, VUT v Brně, https://imse.fme.vutbr.cz/wp-content/themes/umvi_website/assets/materials/winter/6MS/Cviceni/04-Plasticka.pdf"

## Input
d_0 := 9.95 mm                ' diameter of the gauge part of the bar
F_p02 := 17.21 kN             ' force at 0.2 % plastic deformation
F_m := 25.75 kN               ' greatest force during the test
F_u := 17.39 kN               ' force at the moment of fracture
d_u := 5.28 mm                ' diameter of the bar at the fracture
"After fracture the two halves of the bar were put together by their fracture surfaces and two distances of gauge marks were measured: (1) the marks between which the neck lies, originally 50 mm apart; (2) marks originally 100 mm apart."
L_01 := 50 mm
L_u1 := 68.5 mm
L_02 := 100 mm
L_u2 := 128 mm
"The source does not give the modulus of elasticity of the steel; we need it only for the resilience, so we choose the usual value:"
E := 210 GPa
![The test bar before the test and after fracture: diameter d_0 and gauge length L_0, after the test a neck of diameter d_u and the extended length L_u](images/tyc.en.svg){width=80%}

## Strength characteristics
S_0 := π·d_0^2/4 | mm^2
R_p02 := F_p02/S_0 | MPa {eq}
R_m := F_m/S_0 | MPa {eq}

## Deformation characteristics
"Reduction of area from the cross-section at the fracture:"
S_u := π·d_u^2/4 | mm^2
Z := (S_0 - S_u)/S_0 | % {eq}
"The elongation A_5.65 belongs to a short proportional bar with the gauge length L_0 = 5.65·√S_0. For this bar it is 50 mm, so the marks (1):"
L_0 := 5.65·sqrt(S_0) | mm
A_565 := (L_u1 - L_01)/L_01 | % {eq}
"The marks (2) 100 mm apart give a smaller elongation. The extension in the neck is almost the same, but it is spread over twice the length. That is why an elongation is always stated together with the gauge length it belongs to."
A_100 := (L_u2 - L_02)/L_02 | %

## Energy and hardening
"The true stress at the moment of fracture, related to the cross-section of the neck:"
σ_u := F_u/S_u | MPa
"Resilience is the energy of elastic deformation per unit volume up to the yield strength:"
U_r := R_p02^2/(2·E) | MJ/m^3 {eq}
"Tensile toughness is the area under the tensile diagram. Approximately it is the mean of the yield strength and the tensile strength times the elongation:"
U_t := (R_p02 + R_m)/2·A_565 | MJ/m^3 {eq}
"The strain hardening ratio is the ratio of the tensile strength to the yield strength:"
n_z := R_m/R_p02
"Steel 11 458 hardens by about a half: R_m is 1.5 times R_p0.2 and it fractures in a ductile way with a marked neck (reduction of area over 70 %)."
