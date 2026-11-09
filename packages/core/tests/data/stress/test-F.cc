# Zátěžový test F — numerická správnost
"List počítá hodnoty, jejichž správný výsledek je znám z literatury nebo z přesné matematiky. Každý řádek má v komentáři to, co má vyjít; list tak slouží jako trvalá zkouška jádra."

## F1 — kalkulus
f_a := integral(1/sqrt(x), x: 0 .. 1)          ' slabá singularita v nule, má vyjít 2
f_b := integral(exp(-x^2), x: 0 .. ∞)          ' √π/2 = 0.8862269255
f_c := integral(sin(x)^2, x: 0 .. π)           ' π/2 = 1.5707963
f_d := integral(x·exp(-x), x: 0 .. ∞)          ' 1
f_e := derivative(atan(x), x: 1)               ' 0.5
f_f := derivative(exp(x^2), x: 1, order: 2) {decimals=2}  ' (2 + 4x²)e^(x²) v 1 = 6e = 16.30969
f_g := sum(1/k^2, k: 1 .. 1000)                ' 1.6439345667
f_h := trapz([0, 1, 2, 3], [1, 4, 9, 16])      ' lichoběžníkové pravidlo se zadává (x, y): 21.5

## F2 — algebra, kořeny, extrémy
f_i := roots(x^3 - 6·x^2 + 11·x - 6, x)        ' [1; 2; 3]
solve f_j: cos(f_j) == f_j/2 in 0 .. 2         ' 1.0298665293
f_k := minimize((x - 3)^2 + 1, x: 0 .. 10)     ' 3
f_l := max_of(x·(10 m - x), x: 0 m .. 10 m) | m^2   ' 25 m²
f_m := solve h_m: 1 == 3·exp(-h_m/2 s) in 0 s .. 10 s | s   ' 2·ln 3 = 2.1972245773

## F3 — lineární algebra
f_n := det([2, 1, 1 | 1, 3, 1 | 1, 1, 2])      ' 7
f_o := lsolve([2, 1 | 1, 3], [3 | 5])          ' [0.8; 1.4]
A_f := [4, -2 | -2, 4]
f_p := eigenvals(A_f)                          ' [2; 6]
K_f := [2, -1 | -1, 2]
M_f := [1, 0 | 0, 1]
f_q := eigenvals(K_f, M_f)                     ' [1; 3]
chem := [1,0,-1,0,0,0 | 1,0,0,-1,0,0 | 0,1,-1,-2,-2,0 | 0,1,0,0,0,-2 | 4,0,0,0,0,-1]
f_r := whole(nullspace(chem))                  ' 2 KMnO₄ + 16 HCl → 2 KCl + 2 MnCl₂ + 5 Cl₂ + 8 H₂O

## F4 — statistika, rozdělení, náhoda
f_s := mean([2, 4, 4, 4, 5, 5, 7, 9])          ' 5
f_t := stdev([2, 4, 4, 4, 5, 5, 7, 9])         ' 2.1380899352
f_u := normcdf(1.96)                           ' 0.9750021049
f_v := tinv(0.975, 19)                         ' 2.0930240544
f_w := chi2cdf(11.07, 5)                       ' 0.9500045; p-hodnota testu je 1 minus tohle
f_x := besselj(0, 1)                           ' 0.7651976866
f_y := erf(1)                                  ' 0.8427007929
f_z := gamma(5)                                ' 24
f_aa := nchoosek(49, 6) {decimals=8}           ' 13 983 816
f_ab := binocdf(3, 10, 0.3)                    ' 0.6496106588
f_ac := poisspdf(2, 3)                         ' 0.2240418077
rad := rnd(20000, 7, -1, 1)                    ' opakovatelná náhoda daná semínkem
f_ae := mean(rad)                              ' kolem nuly

## F5 — proložení a interpolace
table Mer:
    | x | y |
    | 0 | 1.1 |
    | 1 | 1.9 |
    | 2 | 3.1 |
    | 3 | 3.8 |
    | 4 | 5.2 |
lin_f := fit(Mer.y, x: Mer.x)                  ' přímka, a = 1.00, b = 1.01
f_af := lin_f(5)                               ' 6.05
f_ag := spline([0, 1, 2, 3], [0, 1, 8, 27], 1.5)   ' kubická data spline zopakuje: 3.375
f_ah := polyfit([0, 1, 2, 3], [0, 1, 8, 27], 3)    ' kubik procházející všemi body
f_ai := f_ah(1.5)                              ' 3.375

## F6 — komplexní čísla a jednotky
Z_f := (3 + 4j) Ω
f_aj := abs(Z_f) | Ω                           ' 5
f_ak := arg(Z_f) | °                           ' 53.1301024
f_al := re(230 V / Z_f) | A                    ' 27.6
R_v := (100 Ω ∥ 200 Ω)                         ' 66.6667
f_am := 3000 rpm | rad/s                       ' 314.1592654
f_an := 1 kWh | J                              ' 3 600 000