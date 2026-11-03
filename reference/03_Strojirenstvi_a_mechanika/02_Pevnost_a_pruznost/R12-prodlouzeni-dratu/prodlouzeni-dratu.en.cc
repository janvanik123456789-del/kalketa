# Elongation of a wire under its own weight
"After problem 2091 of a Czech collection of solved physics problems (reseneulohy.cz/2091; originally a Czech problem book of Charles University, 1994). An iron wire of constant cross-section, 200 m long, hangs freely. By how much does it stretch under its own weight? The deformation is elastic. The picture and the graphs are our own."
"Source: Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994, https://reseneulohy.cz/2091"

## Input
l := 200 m            ' length of the wire
ρ := 7800 kg/m^3      ' density of iron
E := 200 GPa          ' modulus of elasticity of iron in tension
g := 9.81 m/s^2       ' gravitational acceleration
"The cross-section S is constant and drops out of the relations, its size is not needed."
![A wire of length l hangs from a support; the element dx at distance x from the free end is pulled by the weight of the part of the wire below it; on the right the stress growing towards the support](images/drat.en.svg){width=75%}

## Analysis
"The wire is pulled down by its own weight, most at the top by the support, where the whole wire hangs, least at the free end. So the stress changes along the length. We divide the wire into thin elements dx in which the stress is constant, stretch each by Hooke's law and add the elongations up by an integral."

## Solution
"The element at distance x from the free end is loaded by the weight of the part of the wire below it; this part has the mass (S is the cross-section)"
relation m_x == ρ·S·x
"and the weight:"
derive G_x := m_x·g == ρ·S·x·g {eq}
"Tensile stress in the element, the weight divided by the cross-section:"
σ_x(x) := ρ·S·x·g/S == ρ·x·g {eq}
"Strain of the element by Hooke's law, ε = Δdx/dx:"
ε_x(x) := σ_x(x)/E == ρ·x·g/E {eq}
"So the element stretches by Δdx = ε_x(x)·dx and the whole wire by the sum of all of them:"
Δl := integral(ε_x(x), x: 0 m .. l) == integral(ρ·x·g/E, x: 0 m .. l) == ρ·g·l^2/(2·E) | mm {eq}

## What the result means
"The stress grows from the free end towards the support, it is largest at the top:"
σ_max := σ_x(l) | MPa
plot(σ_x(x), x: 0 m .. l, title: "Tensile stress along the wire (x from the free end)") | MPa
"The part of the wire of length x from the free end stretches by ρ·g·x²/(2·E); the whole wire by Δl:"
Δl_x(x) := ρ·g·x^2/(2·E)
plot(Δl_x(x), x: 0 m .. l, points: [l, Δl], title: "Elongation of the part of the wire below the point x") | mm
"For comparison: a wire of the same length stressed everywhere by the largest stress σ_max would stretch twice as much:"
Δl_stejne := σ_max/E·l | mm
n := Δl_stejne/Δl
