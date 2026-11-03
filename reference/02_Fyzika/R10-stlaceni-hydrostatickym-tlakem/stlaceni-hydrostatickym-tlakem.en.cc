# Compression of a cube by hydrostatic pressure
"After problem 2155 of a Czech collection of solved physics problems (reseneulohy.cz/2155). A steel cube with an edge of 0.1 m is immersed in water down to a horizontal bottom at a depth of 0.3 m. The modulus of elasticity in tension is 210 GPa. By how much does its volume decrease? The picture is our own."
"Source: https://reseneulohy.cz/2155"

## Data
a := 0.1 m            ' edge of the cube
h := 0.3 m            ' depth of the bottom
E := 210 GPa          ' modulus of elasticity in tension
ρ := 1000 kg/m^3      ' density of water
g := 9.81 m/s^2       ' gravitational acceleration
![A cube on the bottom at depth h: a constant pressure acts on the top face, a pressure growing with depth on the side faces; the height z is measured from the bottom](images/krychle.en.svg){width=80%}

## Analysis
"The cube is in equilibrium and the shear stresses in it cancel: only pressure acts on it. On the top face it is constant, on the side faces it grows linearly with depth. We therefore divide the cube into small cubes on whose faces the pressure is constant, and add up their volume changes by an integral."

## Solution
"Hydrostatic pressure on the top face and on the side faces at height z above the bottom:"
p_s := ρ·g·(h - a) | kPa {eq}
p_v(z) := ρ·g·(h - z) {eq}
"Change of volume of a small cube of original volume dV_0 according to the relative strains in three directions:"
relation dV - dV_0 == (ε_xx + ε_yy + ε_zz)·dV_0 {eq}
"The pressure depends only on z, so in the directions x and y the strain is the same:"
relation ε_yy == ε_xx
derive dV - dV_0 == (2·ε_xx + ε_zz)·dV_0 {eq}
"By Hooke's law, the side faces are pushed by p_v(z), the top and bottom faces by p_s:"
ε_xx(z) := -p_v(z)/E == -ρ·g·(h - z)/E {eq}
ε_zz := -p_s/E == -ρ·g·(h - a)/E {eq}
"Substituting into (4), the relative change of volume of the small cube:"
dV_rel(z) := 2·ε_xx(z) + ε_zz == -ρ·g/E·(2·(h - z) + (h - a)) == -ρ·g/E·(3·h - 2·z - a) {eq}
"The total change of volume by an integral over the whole cube:"
ΔV := integral(integral(integral(dV_rel(z), x: 0 m .. a), y: 0 m .. a), z: 0 m .. a) == -ρ·g/E·integral(integral(integral(3·h - 2·z - a, x: 0 m .. a), y: 0 m .. a), z: 0 m .. a) == -ρ·g·a^2/E·(3·h·a - a^2 - a^2) | m^3 {eq}
"After integration:"
derive ΔV == -ρ·g·a^3/E·(3·h - 2·a) {eq}
"The negative change corresponds to compression: the volume of the cube decreases by"
ΔV_abs := abs(ΔV) | mm^3
"For an idea, the relative change of volume of the whole cube is"
ΔV_rel := ΔV/a^3
