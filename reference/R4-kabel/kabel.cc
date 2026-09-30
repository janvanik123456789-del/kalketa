# Dimenzování kabelu a úbytek napětí
"Referenční výpočet R4: kabel Cu pro trojfázový motor 3×400 V."

## Zadání
P := 22 kW
U := 400 V
cos_φ := 0.85
L := 60 m
θ := 33 °C                              ' teplota okolí
n := 3                                  ' zatížené kabely ve svazku
ΔU_max := 3 %

## Proud a korekce
I_B := P / (√3·U·cos_φ) | A
k := interpolate(Korekce, θ: θ, n: n).k

## Nejmenší vyhovující průřez
kabel := find_min(Kabely, by: S, where: r.I_z·k ≥ I_B)
I_zk := kabel.I_z·k | A

## Úbytek napětí (komplexně)
Z := (kabel.R + 1j·kabel.X)·L | Ω       ' impedance jednoho vodiče
I := polar(I_B, -acos(cos_φ))
ΔU := √3·abs(Z·I) | V
ΔU_rel := ΔU/U | %

## Posouzení
check "Proudová zatížitelnost": I_B ≤ I_zk      source "ČSN 33 2000-5-52"
check "Úbytek napětí": ΔU_rel ≤ ΔU_max          source "ČSN 33 2000-5-52, příl. G"
