# Surfaces in 3D: solids of revolution, saddle and waves
"A sample sheet for graphs of surfaces z(x, y). Each surface can be shown as a map with contour lines or in 3D; a 3D graph is rotated by dragging with the mouse and the rotation is stored in the line (view). Right button on the graph: Surface as a map / Surface in 3D, Section of the surface…, View from above, Appearance of the graph. For solids of revolution the volume is calculated below the surface and compared with a formula."

## Hemisphere
R := 1 m              ' radius of the sphere
x_b := 0.5 m          ' point on the surface
y_b := 0.3 m
"The upper half of a sphere centred at the origin: z² + x² + y² = R². Outside the circle x² + y² ≤ R² the expression has no value, the graph leaves an empty place there and finds the edge exactly."
z(x, y) := sqrt(R^2 - x^2 - y^2)

"A map with contour lines: the contour lines of a sphere are concentric circles, the highest point is in the middle."
plot(z(x, y), x: -R .. R, y: -R .. R, points: [x_b, y_b]) | m

"The same surface in 3D with a section by the plane y = 0: the section is a semicircle of radius R."
plot(z(x, y), x: -R .. R, y: -R .. R, kind: "surface", view: "az=35 el=30", samples: 60, cut: y == 0 m, points: [x_b, y_b]) | m

"Height of the surface at the point (x_b; y_b):"
z_b := z(x_b, y_b) | m

"Volume from the sum of circular slices at height h above the base: a slice has radius √(R² − h²), area π·(R² − h²) and thickness dh."
V := integral(π·(R^2 - h^2), h: 0 m .. R) | m^3
V_2 := 2/3·π·R^3 | m^3
check "Volume of the hemisphere": V == V_2

## Oblate spheroid
a_e := 1 m            ' equatorial semi-axis
c_e := 0.6 m          ' polar semi-axis
"The spheroid arises by rotating an ellipse about the z axis: (x² + y²)/a² + z²/c² = 1. The polar semi-axis is shorter than the equatorial one, so the spheroid is oblate (like the Earth)."
z_e(x, y) := c_e·sqrt(1 - (x^2 + y^2)/a_e^2)
plot(z_e(x, y), x: -a_e .. a_e, y: -a_e .. a_e, kind: "surface", view: "az=30 el=25", samples: 60, cut: x == 0 m) | m

"A slice at height h is a circle of radius a·√(1 − h²/c²):"
V_e := integral(π·a_e^2·(1 - h^2/c_e^2), h: 0 m .. c_e) | m^3
V_e2 := 2/3·π·a_e^2·c_e | m^3
check "Volume of half the spheroid": V_e == V_e2

## Paraboloid of revolution
p := 0.5 m            ' parameter of the parabola
H_p := 1 m            ' height of the liquid level in the bowl
"The paraboloid arises by rotating the parabola z = r²/(2p) about the z axis: the shape of a satellite dish or of the surface of a liquid in a rotating vessel. The section by the plane x = 0 is a parabola."
z_p(x, y) := (x^2 + y^2)/(2·p)
plot(z_p(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=40 el=28", cut: x == 0 m) | m

"Volume of water in the bowl up to height H: a slice at height h is a circle of radius √(2·p·h), area 2·π·p·h."
V_p := integral(2·π·p·h, h: 0 m .. H_p) | m^3
R_p := sqrt(2·p·H_p) | m          ' radius of the level
"The volume of the paraboloid is half the volume of a cylinder with the same base and height (Archimedes):"
V_p2 := π·R_p^2·H_p/2 | m^3
check "Volume of the paraboloid": V_p == V_p2

## Cone
R_k := 1 m            ' radius of the base
H_k := 1.2 m          ' height
"A cone over a circular base; outside it the surface is at zero. The contour lines of a cone are concentric circles at equal distances (the slope is the same everywhere), unlike the sphere and the paraboloid."
z_k(x, y) := max(0 m, H_k·(1 - sqrt(x^2 + y^2)/R_k))
plot(z_k(x, y), x: -R_k .. R_k, y: -R_k .. R_k, levels: 6) | m

"A slice at height h has radius R·(1 − h/H):"
V_k := integral(π·R_k^2·(1 - h/H_k)^2, h: 0 m .. H_k) | m^3
V_k2 := π·R_k^2·H_k/3 | m^3
check "Volume of the cone": V_k == V_k2

## Torus
R_t := 0.7 m          ' radius of the central circle
r_t := 0.25 m         ' radius of the tube
"The upper half of a torus: a circle of radius r rotated about the z axis at distance R. The surface has a hole in the middle and around the outside; the graph finds the edges."
z_t(x, y) := sqrt(r_t^2 - (sqrt(x^2 + y^2) - R_t)^2)
plot(z_t(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=30 el=40", samples: 80, cut: y == 0 m) | m

"Volume of the upper half: a slice at height h is an annulus of width 2·√(r² − h²) around the circle R, area 4·π·R·√(r² − h²). The substitution h = r·sin φ removes the square root:"
V_t := integral(4·π·R_t·r_t^2·cos(φ)^2, φ: 0 .. π/2) | m^3
"Pappus's theorem for the whole torus gives 2·π²·R·r², half of it:"
V_t2 := π^2·R_t·r_t^2 | m^3
check "Volume of half the torus": V_t == V_t2

## Saddle
a := 1 m
"The hyperbolic paraboloid z = (x² − y²)/a has a saddle at the origin: it rises in the direction x and falls in the direction y. The values go to both sides of zero, so the map is blue–white–red with its centre at zero."
s(x, y) := (x^2 - y^2)/a
plot(s(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, levels: 8) | m
plot(s(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=-40 el=35", cut: x == 0 m) | m

## Wave surface
A_w := 0.2 m          ' height of the wave
λ_w := 1 m            ' wavelength
"The surface z = A·sin(2πx/λ)·cos(2πy/λ): bumps and dimples alternate like an egg carton. The map shows a regular chessboard of contour lines."
w(x, y) := A_w·sin(2·π·x/λ_w)·cos(2·π·y/λ_w)
plot(w(x, y), x: 0 m .. 2 m, y: 0 m .. 1 m, levels: 6) | m
plot(w(x, y), x: 0 m .. 2 m, y: 0 m .. 1 m, kind: "surface", view: "az=25 el=45", samples: 60) | m
