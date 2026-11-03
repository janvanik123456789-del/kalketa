# Book shelf: will it hold and stay straight?
"A guide to Kalketa through one calculation. The board of a shelf lies on two brackets and carries a row of books. We work out whether the books will break it and whether it will visibly sag, and find the thinnest board that is enough. Each section starts with a note on what Kalketa shows in it; the notes stay in print, so the sheet also reads as a guide."

## Input: numbers with units
"Tip: a value is entered as a name, “:=” and a number with a unit. Units convert by themselves, millimetres and metres can be mixed. After an apostrophe comes a comment, in print it stands beside the value."
L := 0.8 m {slider=0.4..1.6..0.05}    ' distance of the brackets (span)
b := 250 mm                           ' width (depth) of the board
t := 18 mm                            ' thickness of the board
m_k := 30 kg/m                        ' books per metre of shelf, a full row
![The board on two brackets carries a row of books as a uniform load q; on the right the section of the board b × t](images/police.en.svg){width=85%}
"Tip: the slider under the span L changes the value by dragging, and the whole sheet is calculated again at once. Try making the shelf longer and watch the checks."

## Material from a table
"Tip: the kinds of wood are in a table of the sheet (the Database layer, the Tables panel). The function pick selects a row by its class, and its columns are read with a dot: material.E_0. Another wood is chosen by rewriting the class, for example to “D30” for oak."
material := pick(Dreviny, "C24")
"Strength for the calculation: the characteristic strength is reduced by a factor for permanent load in a dry interior and by the partial factor of the material."
k_mod := 0.6                          ' permanent load, service class 1
γ_M := 1.3                            ' solid timber
f_md := k_mod·material.f_mk/γ_M | MPa

## Load and internal forces: formulas with values
"Tip: in print a formula is written out in general, then with the numbers put in, and finally with the result, as on paper. The unit of the result is set with a vertical bar: | N/m."
g := 9.81 m/s^2
q_k := (m_k + material.ρ·b·t)·g | N/m
q_d := 1.35·q_k | N/m
M_d := q_d·L^2/8 | N·m

## Bending
W := b·t^2/6 | mm^3
σ_m := M_d/W | MPa
check "Bending of the board": σ_m ≤ f_md   source "EN 1995-1-1, cl. 6.1.6"

## Deflection
"Under permanent load wood creeps with time: the deflection grows by the factor k_def. The limit L/300 is usual for visible members; a smaller deflection of a shelf cannot be seen."
E := material.E_0
I := b·t^3/12 | mm^4
k_def := 0.6                          ' solid timber, service class 1
w := (1 + k_def)·5·q_k·L^4/(384·E·I) | mm
w_lim := L/300 | mm
check "Deflection of the shelf": w ≤ w_lim   source "EN 1995-1-1, cl. 7.2"
"Tip: a chart is a line plot(…). With the right mouse button on it you add labels, extremes or hatching; a click on a text of the chart opens its look, and the chart can be stretched by its edge."
w_x(x) := (1 + k_def)·q_k·x·(L^3 - 2·L·x^2 + x^3)/(24·E·I)
plot(-w_x(x), x: 0 m .. L, extremes: true, title: "Deflection along the board") | mm

## The thinnest board that is enough
"Tip: the solver solve finds an unknown from an equation. Here the thickness at which the deflection is just at the limit; Kalketa rearranges the equation into a formula and writes it out. The interval after “in” says where to look for the root, and the result takes its unit."
solve t_min: (1 + k_def)·5·q_k·L^4/(384·E·b·t_min^3/12) == w_lim in 5 mm .. 50 mm
"Boards are made in a series of thicknesses 18, 22, 25 and 28 mm; we choose the next one up. The weight of the board changes little with its thickness, the calculation takes it from the 18 mm board."

## What next
"Result: an 18 mm board of C24 spruce carries the books over 80 cm with a large reserve, the deflection decides. An overview of the checks is at the start of the printout, in the editor in the status bar below. The theory of the calculation (where the formulas for the moment and the deflection come from, what the factors mean) is in the Sources layer under the sheet. The calculation again in Python, which runs and compares itself with the sheet, is in the layer Check in Python. Kalketa numbers the sections itself (File → Properties → Numbering of sections), where the style and the language of the printout are set too. File → Sample calculations offers more calculations by field."
