# Stress on the cross-section of a beam
"After problem 2159 of a Czech collection of solved physics problems (reseneulohy.cz/2159). A steel beam of length 5 m is loaded vertically downward by a force of 10 kN at a quarter of its length and by a force of 20 kN at two thirds of its length, and is supported at the ends. For which of the rectangular cross-sections 0.1 × 0.2 m and 0.2 × 0.1 m does the beam deflect more? For that cross-section find the distribution of the stress in the first third of the length. The self-weight is neglected. The pictures and graphs are our own."
"Source: https://reseneulohy.cz/2159"

## Data
l := 5 m              ' length of the beam
F_1 := 10 kN          ' force at the first quarter
F_2 := 20 kN          ' force at two thirds
x_1 := l/4            ' point of action of the first force
x_2 := 2·l/3          ' point of action of the second force
a_1 := 0.1 m          ' width of the first cross-section
b_1 := 0.2 m          ' height of the first cross-section
a_2 := 0.2 m          ' width of the second cross-section
b_2 := 0.1 m          ' height of the second cross-section
E := 210 GPa          ' Young's modulus of steel (only for the deflection)
![A beam on two supports with forces F₁ and F₂ and reactions V₁ and V₂; the section in the first third of the length is marked](images/nosnik.en.svg){width=90%}

## Reactions at the supports
"Equilibrium of forces and equilibrium of moments about the left support:"
relation V_1 + V_2 == F_1 + F_2 {eq}
relation l·V_2 == x_1·F_1 + x_2·F_2 {eq}
"From (2) and by substituting into (1):"
derive V_2 == (x_1·F_1 + x_2·F_2)/l {eq}
derive V_1 == ((l - x_1)·F_1 + (l - x_2)·F_2)/l {eq}
V_2 := (x_1·F_1 + x_2·F_2)/l | kN
V_1 := ((l - x_1)·F_1 + (l - x_2)·F_2)/l | kN

## Bending moment
"Moment of the forces to the left of the section x, with the sign as in the collection (tension at the bottom is a negative moment); between the forces x_1 < x < x_2 it is M(x) = −V_1·x + F_1·(x − x_1):"
M(x) := -V_1·x + if(x > x_1, F_1·(x - x_1), 0 kN·m) + if(x > x_2, F_2·(x - x_2), 0 kN·m) {eq}
plot(M(x), x: 0 m .. l, extremes: true, title: "Bending moment diagram") | kN·m

## Second moment of area
![Two rectangular cross-sections: the first on edge (0.1 × 0.2 m), the second flat (0.2 × 0.1 m); the neutral axis passes through the centroid](images/prurezy.en.svg){width=70%}
"For a rectangle of width a and height b, axis y vertical from the centroid:"
I_1 := integral(integral(y^2, y: -b_1/2 .. b_1/2), z: -a_1/2 .. a_1/2) == a_1·b_1^3/12 | cm^4 {eq}
I_2 := integral(integral(y^2, y: -b_2/2 .. b_2/2), z: -a_2/2 .. a_2/2) == a_2·b_2^3/12 | cm^4
"The curvature of the beam is M/(E·I): the smaller I, the greater the bending. Ratio of the curvatures:"
n_ohyb := I_1/I_2
"The deflection w(x), the vertical displacement of the axis of the beam, from the equation of the deflection curve w″ = −M(x)/(E·I), zero at the supports (in the collection equation (7), where the deflection is written y′ with primes, so as not to be confused with the coordinate y in the cross-section):"
solve w_1(x): E·I_1·w_1″ == -M(x) in 0 m .. l
    w_1(0 m) == 0 m
    w_1(l) == 0 m
solve w_2(x): E·I_2·w_2″ == -M(x) in 0 m .. l
    w_2(0 m) == 0 m
    w_2(l) == 0 m
plot(w_1(x), w_2(x), x: 0 m .. l, title: "Deflection curve of both cross-sections") | mm
x_w := minimize(w_2(x), x: 0 m .. l)
w_1max := -w_1(x_w) | mm
w_2max := -w_2(x_w) | mm
"The second cross-section deflects this many times as much:"
n_w := w_2max/w_1max

## Stress on the cross-section in the first third
"The second cross-section deflects more; for it we find the stress at the section x_σ = l/3. Here y is not the deflection but the height of the fibre in the cross-section above the centroid (the neutral axis): −b_2/2 ≤ y ≤ b_2/2."
x_σ := l/3
M_σ := M(x_σ) | kN·m
σ(y) := M_σ/I_2·y == 12·M_σ/(a_2·b_2^3)·y == -12/(a_2·b_2^3)·(V_1·x_σ - F_1·(x_σ - x_1))·y {eq}
"The stress is linear in the height y; here is how much it changes per metre of the height of the cross-section:"
k_σ := σ(1 m)/(1 m) | GPa/m
σ_h := σ(b_2/2) | MPa      ' upper edge: compression
σ_d := σ(-b_2/2) | MPa     ' lower edge: tension
plot(σ(y), y: -b_2/2 .. b_2/2, roots: true, title: "Stress on the cross-section in the first third of the length") | MPa
![Distribution of the normal stress over the height of the cross-section: compression at the top, tension at the bottom, zero at the centroid](images/napeti.en.svg){width=55%}
"Note: in formula (10) of the collection the term F₁ has the sign + instead of −; that is why the slope there comes out −5/3 GPa/m. From formulas (5) and (9) it comes out, as calculated above, −7/6 GPa/m. Written as it is in the collection, this step would be rejected by Kalketa when it verifies the derivation."
