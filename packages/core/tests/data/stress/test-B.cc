# Zátěžový test B — numerika, řešič, tabulky, grafy
"Kontrolní list: ověřuje, že se obtížné výpočty spočítají a že list pozná, když ne."

## B1 — integrály a derivace
I_1 := integral(1/sqrt(x), x: 0 .. 1)      ' OČ: 2 (slabá singularita v nule)
I_2 := integral(exp(-x^2), x: 0 .. ∞)      ' OČ: 0.8862 (√π/2)
D_5 := derivative(sin(x), x: 0, order: 5)  ' OČ: 1 (pátá derivace sinu v nule)
S_100 := sum(1/k^2, k: 1 .. 100)           ' OČ: 1.6350

## B2 — řešič
q_B2 := 12 kN/m                       ' pro solve níže
solve x_r: x_r^2 + 2·x_r == 8 in 0 .. 10   ' OČ: 2
solve L_v: 37.5 kN·m == q_B2·L_v^2/8  ' OČ: √(8·M/q) = 5 m, vzorcem bez intervalu
solve y_k ∈ ℝ, y_k > 0: 5·y_k^2 + 4·y_k - 10 == 0   ' OČ: 1.07, s diskriminantem
solve d_n: 300 mm^2 <= π·d_n^2/4           ' OČ: nerovnice, d_n ≥ 19.54 mm
K_res := [12 kN/m, 6 kN | 6 kN, 4 kN·m]
F_res := [1 kN | 0 kN·m]
u_res := lsolve(K_res, F_res)              ' OČ: [0.3333 m; -0.5]

## B3 — diferenciální rovnice
q_B := 10 kN/m
L_B := 6 m
E_B := 210 GPa
I_B := 8360 cm^4
M_B(x) := q_B·x·(L_B - x)/2
solve w(x): E_B·I_B·w″ == -M_B(x) in 0 m .. L_B
    w(0 m) == 0 m
    w(L_B) == 0 m
w_max := w(L_B/2) | mm                     ' OČ: 9.612 mm
w_analy := 5·q_B·L_B^4/(384·E_B·I_B) | mm  ' OČ: 9.612 mm, souhlas s řešičem
check "Řešič proti vzorci": abs(w_max - w_analy) ≤ 0.01 mm   ' OČ: ✓

## B4 — transcendentní rovnice
λ(Re) := solve l: 1/sqrt(l) == 2·log10(Re·sqrt(l)) - 0.8 in 0.005 .. 0.1
λ_1e5 := λ(1e5)                            ' OČ: cca 0.018 (Colebrook)

## B5 — tabulka, počítaný sloupec, předchozí řádek
r_B := 0.05
table Splatky: {rows=1..5}
    | k | splatka = pmt(r_B, 5, 100000 CZK) | dluh = prev(dluh, 100000 CZK)·(1 + r_B) - splatka |
"OČ: pět řádků, dluh klesá k nule."
table Body:
    | t [s] | v [m/s] |
    | 0 | 0 |
    | 1 | 3.2 |
    | 2 | 6.1 |
    | 3 | 8.9 |
a_prum := (Body.v[4] - Body.v[1])/(Body.t[4] - Body.t[1])   ' OČ: 2.967 m/s²
fity := fit(Body.v, x: Body.t)             ' OČ: přímka, R² blízko 1

## B6 — grafy
y_B(x) := x^3 - 3·x
plot(y_B(x), x: -3 .. 2, roots: true, extremes: true, inflections: true)
plot(1/x, x: -2 .. 2)                      ' OČ: díra v nule, ne chyba
plot(y_B(x), x: -3 .. 2, ylim: 100 .. 200) ' OČ: varování, že osa křivku skryje
plot(x^2 + y^2 == 25, x: -6 .. 6, y: -6 .. 6)   ' OČ: kružnice
plot(Body.v, x: Body.t, kind: "points")
plot(y_B(x), x: 1 .. 8, xscale: "log", yscale: "log")   ' OČ: log-log, záporné body vynechá

## B7 — statistika a náhoda
n_B := 20
k_B := tinv(0.975, n_B - 1)                ' OČ: 2.093
sem := rnd(1000, 42, 0, 1)                 ' OČ: opakovatelná náhoda
průměr_sem := mean(sem)                    ' OČ: kolem 0.5
rho_test := 0.975
hodnota_test := sqrt(-1)                   ' OČ: chyba, odmocnina ze záporného