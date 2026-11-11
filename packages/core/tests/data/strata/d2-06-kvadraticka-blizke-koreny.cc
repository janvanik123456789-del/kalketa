# Kvadratická rovnice s blízkými kořeny

"Kořeny lišící se v čtvrtém desetinném místě: b² se od 4ac liší o 1e-8."
a := 1
b := -2.0001
c := 1.0001
D := b² - 4·a·c
solve x ∈ ℝ: a·x² + b·x + c == 0
"Oba kořeny z učebcového vzorce, dosazeno."
x_uc1 := (-b + sqrt(D))/(2·a)
x_uc2 := (-b - sqrt(D))/(2·a)
"Vietův vztah jako nezávislá kontrola součtu a součinu kořenů."
check "Součet kořenů": abs((x_1 + x_2) - (-b/a)) < 1e-9
check "Součin kořenů": abs(x_1·x_2 - c/a) < 1e-9
"Kořeny dosazením do rovnice: doplněk musí být řádově pod mezní přesností."
d1 := a·x_1² + b·x_1 + c
d2 := a·x_2² + b·x_2 + c
check "Dosazení x_1": abs(d1) < 1e-9
check "Dosazení x_2": abs(d2) < 1e-9
