# Course of the reversible reaction A ⇌ B and the time to equilibrium
"Own task: a substance A turns into its isomer B in solution, and B back into A. Both reactions are of the first order. At the start only A is present. We look for the course of both concentrations, their values after 10 minutes and the time in which the reaction covers 90 % of the way to equilibrium. The two equations are coupled, so they are solved as a system."
"Source: own task, verified by the exact solution (section 4 of the sheet) and independently in Python (Check in Python layer)."

## Input
k_1 := 0.002 1/s         ' rate constant A → B
k_2 := 0.001 1/s         ' rate constant B → A
a_0 := 1 mol/l           ' initial concentration of A
b_0 := 0 mol/l           ' initial concentration of B
t_e := 3600 s            ' time observed

## System of equations
"The loss of A is the conversion to B less the conversion back, the opposite for B. Kalketa integrates the system and the result is the functions a(t) and b(t) with their derivatives."
solve (a(t), b(t)): a′ == -k_1·a + k_2·b, b′ == k_1·a - k_2·b in 0 s .. t_e
    a(0 s) == a_0
    b(0 s) == b_0
plot(a(t), b(t), t: 0 s .. t_e, title: "Concentrations of A and B over time", xlabel: "t", ylabel: "c") | mol/l

## Values from the solution
a_600 := a(600 s) | mol/l
b_600 := b(600 s) | mol/l
a_e := a(t_e) | mol/l
b_e := b(t_e) | mol/l
r_e := a′(t_e) | mol/(l·s)

## Equilibrium and the exact solution
"At equilibrium both conversions balance, k_1·a = k_2·b. The system also has an exact solution: the distance from equilibrium falls exponentially with the time constant 1/(k_1 + k_2), which depends on the sum of both constants."
K := k_1/k_2
a_r := a_0·k_2/(k_1 + k_2) | mol/l
b_r := a_0·k_1/(k_1 + k_2) | mol/l
τ := 1/(k_1 + k_2) | s
t_90 := τ·ln(10) | s
a_90 := a(t_90) | mol/l
a_presne := a_r + (a_0 - a_r)·exp(-600 s/τ) | mol/l

## Checks
check "The total amount does not change": abs(a(t_e/3) + b(t_e/3) - a_0) ≤ 1e-6 mol/l
check "The numerical solution agrees with the exact one": abs(a_600 - a_presne) ≤ 1e-5 mol/l
check "At the end the ratio of concentrations is the equilibrium constant": abs(b_e/a_e - K) ≤ 0.01
check "At t_90 the reaction has covered 90 % of the way to equilibrium": abs((a_0 - a_90) - 0.9·(a_0 - a_r)) ≤ 1e-5 mol/l
"After 10 minutes 0.444 mol/l of A remains. The equilibrium ratio is 1 : 2 and the reaction covers 90 % of the way to it in 768 s. The sum of the constants sets the time to equilibrium, so a larger constant of the reverse reaction would not only shift the equilibrium but also speed the approach to it."
