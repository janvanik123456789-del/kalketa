# Cable sizing and voltage drop
"Reference calculation R4: a copper cable for a three-phase motor, 3×400 V."

## Input
P := 22 kW
U := 400 V
cos_φ := 0.85
L := 60 m
θ := 33 °C                              ' ambient temperature
n := 3                                  ' loaded cables in a bundle
ΔU_max := 3 %

## Current and correction
I_B := P / (√3·U·cos_φ) | A
k := interpolate(Korekce, θ: θ, n: n).k

## Smallest adequate cross-section
kabel := find_min(Kabely, by: S, where: r.I_z·k ≥ I_B)
I_zk := kabel.I_z·k | A

## Voltage drop (complex)
Z := (kabel.R + 1j·kabel.X)·L | Ω       ' impedance of one conductor
I := polar(I_B, -acos(cos_φ))
ΔU := √3·abs(Z·I) | V
ΔU_rel := ΔU/U | %

## Checks
check "Current-carrying capacity": I_B ≤ I_zk      source "ČSN 33 2000-5-52"
check "Voltage drop": ΔU_rel ≤ ΔU_max          source "ČSN 33 2000-5-52, příl. G"
