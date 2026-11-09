# Zátěžový test A — jednotky, teplota, rozměry
"Kontrolní list: každá řádka ověřuje jedno pravidlo zápisu. Očekávání je v komentáři za řádkou."

## A1 — převrácené jednotky a molární koncentrace
alpha := 12e-6 1/°C         ' OČ: 12e-6 /°C, žádná chyba
beta := 3 1/(m·s)           ' OČ: 3 /(m·s)
c_0 := 0.5 mM               ' OČ: 0.5 mol/m³, jednotka mol/l

## A2 — jednotka, nebo proměnná?
L := 5 m                    ' OČ: žádná
A := 200 mm^2               ' OČ: plocha, která si říká o jednotku
V_1 := 2 L                  ' OČ: 10 l (dvoulitrová lahve) + info I-AMBIGUOUS-UNIT
L_2 := 100 kN/A             ' OČ: varování W-NAME-AS-UNIT (A je tu plocha, ne ampér)
x_1 := 2 [m]                ' OČ: 2 m, hranatá závorka vynutí jednotku

## A3 — implicitní násobení
a_1 := 5 m                  ' OČ: 5 m
a_2 := 2(a_1 + 3 m)         ' OČ: 16 m, číslo a závorka se násobí
chyba_implicitni := a_1 a_2 ' OČ: chyba, chybí · (W-IMPLICIT-MUL / E-syntax)
zlomek_palca := 3/8 in      ' OČ: 3/(8 in) s jednotkou ve jmenovateli + upozornění

## A4 — skládání jednotek a odmocnina
F := 800 N
S_kruh := 1500 mm^2
d_kol := sqrt(4·S_kruh/π)   ' OČ: mm, ne N/MPa a ne metry
τ_smyk := F/S_kruh          ' OČ: MPa (N/mm² → MPa)
q := 12 kN/m
M_bod := q·L²/8             ' OČ: kN·m, ne J
p_vzduch := 1000 kg/m³ · 9.81 m/s² · 2 m   ' OČ: kg/(m·s²) → Pa
w_kWh := 2 kW · 3 h         ' OČ: kWh, ne J

## A5 — teplota
t_1 := 20 °C                ' absolutní teplota s posunem
t_2 := 80 °C
Δt := t_2 - t_1             ' OČ: 60 Δ°C (rozdíl, ne 100 °C)
T_1K := 293.15 K            ' teplota od absolutní nuly
T_2K := 353.15 K
t_průměr_K := (T_1K + T_2K)/2   ' OČ: 50 °C, součet teplot v K je v pořádku
c_voda := 4180 J/(kg·K)
m_voda := 2 kg
Q_zbytecne := m_voda·c_voda·t_1   ' OČ: varování W-ABS-TEMP-MUL (teplota ve °C v součinu)
ΔT := 50 °C                 ' OČ: jméno s Δ → rozdíl 50 Δ°C
Q_radne := m_voda·c_voda·ΔT  ' OČ: 418 kJ bez varování
T_K := 293.15 K             ' OČ: termodynamická teplota
T_na_C := T_K | °C          ' OČ: 20 °C, ne 366 °C
Δ_T := 10 K                 ' OČ: rozdíl 10 Δ°C

## A6 — úhel je bezrozměrný
φ := 30°
sin_φ := sin(φ)             ' OČ: 0.5
sin_rad := sin(30)          ' OČ: -0.988 (radiány, ne 0.5)
ω_otočky := 3000 rpm
ω_rad := ω_otočky | rad/s   ' OČ: 314.16 rad/s
f_Hz := 50 Hz
ω_2pi := 2·π·f_Hz           ' OČ: 314.16 rad/s
M_to := 10 N·m · ω_otočky   ' OČ: varování W-TURNS-IN-POWER

## A7 — měny a počitatelné jednotky
unit ks: dimensionless      ' OČ: vlastní počitatelná jednotka
kos := 12 ks                ' OČ: 12 ks
dane := 1000 CZK
chybne := dane + 5 EUR      ' OČ: chyba E-UNIT-MISMATCH, dokud list neurčí kurz