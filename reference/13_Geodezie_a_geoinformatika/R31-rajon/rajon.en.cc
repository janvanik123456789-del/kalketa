# Radial survey: coordinates of a new point in S-JTSK
"After a worked example Coordinate calculations – radial survey (Faculty of Science, Charles University, in Czech). At the given point 517 a theodolite measured the horizontal direction to the given point 518 (the orientation) and to the new point 550, and the distance to it. We determine the coordinates of point 550 from the bearing of the orientation, the angle at the vertex and the distance. In S-JTSK the X axis points south and the Y axis west, angles are measured in gradians (gon, a right angle is 100 gon). The sketch is our own."
"Source: Souřadnicové výpočty – výpočet rajónu, Přírodovědecká fakulta UK, https://natur.cuni.cz/data/nodes/6155/rajon_vzorovy_vypocet.pdf"

## Input
Y_517 := 668249.55 m
X_517 := 1119008.31 m
Y_518 := 668625.06 m
X_518 := 1120260.63 m
"Measured directions at station 517 and the distance reduced to the S-JTSK projection:"
ψ_518 := 82.0285 gon
ψ_550 := 189.2487 gon
d_550 := 286.45 m
![Radial survey: from point 517 the orientation to point 518 with bearing σ, the angle at the vertex ω and the distance d to the new point 550; X axis to the south, Y to the west](images/rajon.svg){width=60%}

## Bearing and angle
"The bearing is the angle from the positive X axis to the direction to the point, clockwise, 0 to 400 gon:"
σ := mod(atan2(Y_518 - Y_517, X_518 - X_517), 2·π) | gon {eq}
ω := ψ_550 - ψ_518 | gon {eq}
α := σ + ω | gon {eq}

## Coordinates of the new point
Y_550 := Y_517 + d_550·sin(α) | m {decimals=2}
X_550 := X_517 + d_550·cos(α) | m {decimals=2}
check "Coordinates as in the source (668512.86; 1118895.51)": abs(Y_550 - 668512.86 m) ≤ 0.005 m and abs(X_550 - 1118895.51 m) ≤ 0.005 m
"In the source the calculation of X has a misprint, 268.45 m instead of 286.45 m; the increments used correspond to a distance of 286.45 m."
