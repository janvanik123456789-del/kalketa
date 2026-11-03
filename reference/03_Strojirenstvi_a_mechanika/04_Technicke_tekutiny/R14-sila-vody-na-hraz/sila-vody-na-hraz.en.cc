# Force and moment of water on the vertical wall of a dam
"After problem 1152 of a Czech collection of solved physics problems (reseneulohy.cz/1152; originally Halpern: Schaum's 3000 Solved Problems in Physics). The water at a dam reaches the height h, the dam is l long. Find the resulting force F with which the water pushes the dam horizontally, its moment M about the point O at the foot of the dam, and the height H above the foot at which the force F would have the moment M. The task is general; for an idea we substitute a dam 30 m high and 100 m long (an assumption). The picture and the graphs are our own."
"Source: https://reseneulohy.cz/1152"

## Input
h := 30 m             ' height of the water at the dam (assumption)
l := 100 m            ' length of the dam (assumption)
ρ := 1000 kg/m^3      ' density of water
g := 9.81 m/s^2       ' gravitational acceleration
![Side view of the dam: water up to the height h, a horizontal strip dy at depth y below the surface, the pressure force dF on it and its arm r to the point O at the foot of the dam](images/hraz.en.svg){width=80%}

## Force of the water
"At depth y below the surface we mark a horizontal strip of height dy; on the inner and the outer side of the dam it has the area"
relation dS == l·dy {eq}
"From the inside it is pressed by the water and the air above it, from the outside only by the air:"
relation p == p_h + p_a {eq}
relation dF_1 == p·dS {eq}
relation dF_2 == p_a·dS {eq}
"The resulting force on the strip; the atmospheric pressure cancels from the inside and the outside:"
relation dF == dF_1 - dF_2 {eq}
derive dF == p_h·dS
"Hydrostatic pressure at depth y:"
relation p_h == ρ·g·y {eq}
derive dF == ρ·g·y·l·dy {eq}
"The force on the whole wall is the sum over all strips from the surface to the bottom:"
F := integral(ρ·g·y·l, y: 0 m .. h) == ρ·g·l·h^2/2 | MN {eq}

## Moment of the force about the foot of the dam
"The strip at depth y has an arm to the point O at the foot of the dam, its height above the foot:"
relation dM == r·dF {eq}
relation r == h - y {eq}
derive dM == (h - y)·ρ·g·y·l·dy {eq}
M := integral((h - y)·ρ·g·y·l, y: 0 m .. h) == ρ·g·l·h^3/6 | MN·m {eq}

## Point of action of the resultant force
"The force F in a single point would have the moment M at the height H above the foot:"
H := M/F == (ρ·g·l·h^3/6)/(ρ·g·l·h^2/2) == h/3 | m {eq}
"So the resultant of the water pressure acts at one third of the height of the water above the foot of the dam."

## Course along the height
"The water pressure grows evenly with depth, from zero at the surface:"
p_v(y) := ρ·g·y
plot(p_v(y), y: 0 m .. h, title: "Hydrostatic pressure at depth y") | kPa
"The load on the dam per metre of height q(y) = ρ·g·y·l; the area under it is the resultant force F:"
q(y) := ρ·g·y·l
plot(q(y), y: 0 m .. h, area: 0 m .. h, title: "Load on the dam along the height; the area is the force F") | MN/m
