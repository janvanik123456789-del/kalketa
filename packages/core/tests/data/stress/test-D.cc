# Zátěžový test D — struktury, tabulky, varianty, finance
"Ověřuje hrubší nástroje: nosník, průřez, tabulku variant, srovnání variant, interpolaci, výběr z tabulky, finance a data."

## D1 — nosník a průřez
L_1 := 6 m
L_2 := 4.5 m
L_D := L_1 + L_2
q_D := 12 kN/m
F_D := 30 kN
a_D := 3 m
E_D := 210 GPa
prurez := i_section(300 mm, 150 mm, 7.1 mm, 10.7 mm, 15 mm)   ' OČ: IPE 300
I_D := prurez.I_y           ' OČ: 8 356 cm⁴
W_D := prurez.W_y           ' OČ: 557 cm³
nosnik := beam(L: L_D, EI: E_D·I_D, pins: [0 m, L_1, L_D], q: q_D, at: [a_D], F: [F_D])
M_max := nosnik.M_max | kN·m   ' OČ: 67,4 kN·m
w_max := nosnik.w_max | mm
check "Rovnováha nosníku": abs(nosnik.R[1] + nosnik.R[2] + nosnik.R[3] - q_D·L_D - F_D) ≤ 0.001 kN   ' OČ: ✓
plot(beam_M(nosnik, x), x: 0 m .. L_D, title: "Moment") | kN·m

## D2 — konzola
konsole := beam(L: 4 m, EI: 20 MN·m^2, fixed: [0 m], q: 8 kN/m)
w_k := konsole.w_max | mm   ' OČ: qL⁴/8EI = 12.8 mm
w_k_analy := 8 kN/m·(4 m)^4/(8·20 MN·m^2) | mm
check "Konzola proti vzorci": abs(w_k - w_k_analy) ≤ 0.1 mm   ' OČ: ✓

## D3 — tabulka variant a srovnání
table Prurezy: {variants=B}
    | varianta | b [mm] | h [mm] |
    | A        | 200    | 300    |
    | B        | 250    | 400    |
    | C        | 300    | 500    |
M_D := 120 kN·m             ' OČ: b, h se jinde nedefinují
W_m := b·h^2/6 | mm^3
sigma_D := M_D/W_m | MPa
check "Napětí do 20 MPa": sigma_D ≤ 20 MPa    ' OČ: list ukáže využití
srovnani := compare(Prurezy, W_m, sigma_D)    ' OČ: tři řádky vedle sebe
nejlepsi := find_min(srovnani, by: sigma_D).varianta   ' OČ: C

## D4 — interpolace a výběr z tabulky
table Korekce:
    | θ [°C] | n | k |
    | 0  | 1 | 1.00 |
    | 0  | 2 | 0.85 |
    | 30 | 1 | 0.93 |
    | 30 | 2 | 0.79 |
k_2d := interpolate(Korekce, θ: 15 °C, n: 2).k   ' OČ: 0.82
k_mimo := interpolate(Korekce, θ: 45 °C, n: 2).k ' OČ: extrapolace + varování
table Kabely:
    | jmenovity | I_z [A] |
    | 1.5 | 20 |
    | 2.5 | 27 |
    | 4   | 36 |
    | 6   | 46 |
I_B := 30 A
vybrany := find_min(Kabely, by: jmenovity, where: r.I_z ≥ I_B)   ' OČ: 4 mm²
mimo_klice := pick(Korekce, "nic")              ' OČ: chyba, takový řádek v tabulce není

## D5 — finance a data
CF_D := [-100000 CZK, 30000 CZK, 40000 CZK, 50000 CZK]
NPV_D := npv(8 %, CF_D)     ' OČ: 1 762,94 Kč
IRR_D := irr(CF_D) | %      ' OČ: 8,896 %
splatka_D := pmt(5 %, 20, 1_000_000 CZK)   ' OČ: 80 242,59 Kč
navrat := payback(CF_D)     ' OČ: 2.6
d_1 := 2026-01-15
d_2 := 2026-11-08
rozdil_dnu := d_2 - d_1     ' OČ: 297 d
za_rok := d_2 + 1 yr        ' OČ: 2027-11-08
roky := (d_2 - d_1) | yr    ' OČ: 0.813 yr

## D6 — matice a vlastní čísla
K_D := [2 kN/m, -1 kN/m | -1 kN/m, 2 kN/m]
M_D2 := [1 kg, 0 | 0, 1 kg]
ω_2 := eigenvals(K_D, M_D2)          ' OČ: [1000; 3000] 1/s²
det_D := det(K_D)                    ' OČ: 3 (kN/m)²
x_D := lsolve(K_D, [1 kN | 0 kN])    ' OČ: [0.6667 m; 0.3333 m]
v_D := vector(i^2, i: 1 .. 5)        ' OČ: [1; 4; 9; 16; 25]
m_D := matrix(i·j, i: 1 .. 3, j: 1 .. 3)   ' OČ: matice 3×3