# Dilution of a solution and pH of acetic acid
"Reference calculation R3: preparing a solution from a table of substances and the dissociation equilibrium of a weak acid."

## Preparing the solution
sul := pick(Latky, "NaCl")
V := 500 mL
c := 0.154 mol/L                             ' physiological saline
m := c·V·sul.M | g
w := m/(m + V·1 kg/L) | %                    ' mass fraction (density of water 1 kg/L)

## Dilution
c_2 := 0.05 mol/L
V_2 := c·V/c_2 | mL

## Dissociation of acetic acid
K_a := 0.000018                              ' at 25 °C
c_0 := 0.1 mol/L
solve x: x²/(c_0 - x) == K_a·(1 mol/L) in 0 mol/L .. 0.1 mol/L
pH := -log10(x/(1 mol/L))
α := x/c_0 | %                               ' degree of dissociation

## Checks
check "The salt dissolves": m ≤ sul.rozpustnost·V     source "table of substances"
check "Weak acid": α ≤ 5 %                   source "simplification x ≪ c_0"
