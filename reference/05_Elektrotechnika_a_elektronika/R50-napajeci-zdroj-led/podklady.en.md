# Power supply for LED lighting {#T1}

The theory behind the calculation, in our own words. Kalketa verifies the formulas in the boxes. The numbering of the sections matches the citations in the sheet.

## LED load and ballast resistor {#T2}

An LED behaves like a diode with an almost constant forward voltage, but its current rises very steeply with voltage. That is why LEDs are driven by a current, and each string gets a ballast resistor that takes over the rest of the supply voltage and sets the current. The voltage of a string is the sum of the voltages of all LEDs in series; the currents of parallel strings add up.

```kalk
relation U_s == N_s·U_f
relation I == n_s·I_s
relation R_s == (U_dc - U_s)/I_s
relation P_R == I_s^2·R_s
relation P_out == U_dc·I
```

The power wasted in the resistors is the price of a stable current: the smaller the difference between the supply voltage and the string voltage, the more efficient the supply. The share of the LED power in the output power is exactly the ratio of the string voltage to the supply voltage, because the current is the same in both. Verification with numbers:

```kalk
N_s := 7
U_f := 3 V
I_s := 0.2 A
n_s := 8
U_dc := 24 V
U_s := N_s·U_f
R_s := (U_dc - U_s)/I_s
P_LED := n_s·N_s·U_f·I_s
P_out := U_dc·n_s·I_s
check "The share of the LED power is the ratio of the voltages": abs(P_LED/P_out - U_s/U_dc) ≤ 0.000001
check "The resistance is positive": R_s > 0 Ω
```

## Transformer {#T3}

A transformer transfers power by an alternating magnetic flux in an iron core. The voltage of a winding is proportional to its number of turns, so the turns ratio is both the ratio of the numbers of turns and the ratio of the voltages. The secondary voltage must be enough for the peak voltage of the capacitor plus the drops on the two diodes of the bridge, and under load it is somewhat lower than at no load.

The mean voltage on the capacitor lies half the ripple below the peak. For the mean voltage to be U_z, the capacitor peak must be U_z + ΔU/2 and the secondary peak two diode drops higher. The rms value of a sine wave is its peak divided by the square root of two.

```kalk
relation U_2m == U_z + ΔU/2 + 2·U_F
relation U_2 == U_2m/sqrt(2)
relation U_20 == U_2/(1 - d_u)
relation n == U_1/U_20
relation I_2 == k_I·I_z
relation S == U_2·I_2
relation I_1 == S/U_1
relation U == 4.44·f·N·B_m·A_Fe
```

The relation between voltage and number of turns follows from Faraday's law: for a sinusoidal flux with amplitude Φ_m = B_m·A_Fe the rms winding voltage is 2π/√2·f·N·Φ_m, that is about 4.44·f·N·B_m·A_Fe, because 2π/√2 ≈ 4.443. Verification:

```kalk
f := 50 Hz
N := 100
B_m := 1.2 T
A_Fe := 9 cm^2
U_e := 2·π/sqrt(2)·f·N·B_m·A_Fe | V
U_k := 4.44·f·N·B_m·A_Fe | V
check "The constant 4.44 is 2π/√2 to a thousandth": abs(U_e - U_k)/U_e ≤ 0.001
```

- The capacitor behind the rectifier draws current only in short peaks, so the rms current of the winding is larger than the direct load current, commonly about 1.8 times.
- The apparent power S sets the size of the transformer; it depends on the watts of the load only in part.
- The number of turns is rounded up: more turns mean a smaller flux density at the same voltage, so the core does not saturate. The ratio of the rounded numbers differs from the turns ratio by at most one turn of the smaller winding, that is by 1/N_2.

## Rectification and filtering {#T4}

A Graetz bridge of four diodes passes the current in the same direction in both half-waves. In each half-wave two diodes conduct in series with the load, so the peak voltage is reduced by two drops. The capacitor is charged to the peak and discharges into the load between the peaks by an almost constant current, so the voltage falls approximately linearly between the peaks. The ripple swing is proportional to the current and inversely proportional to the capacitance and to the frequency of the rectified voltage, which is twice the mains frequency.

```kalk
relation U_m == sqrt(2)·U_2 - 2·U_F
relation ΔU == I_z/(2·f·C)
relation U_min == U_m - ΔU
relation U_str == U_m - ΔU/2
relation I_D == I_z/2
relation U_RRM == k_u·U_m
relation U_C == k_c·U_m
```

The swing follows from the charge the load takes during half a mains period: Q = I_z·T/2 = C·ΔU. The calculation is deliberately simple. In reality the capacitor discharges for a somewhat shorter time, because the next arc starts to charge it before the sine wave reaches its peak, so the real ripple is a little smaller than the formula gives. The formula is therefore an estimate on the safe side. The mean voltage of a saw-tooth is at half the swing, hence U_str = U_m − ΔU/2; it is the only one of them that matches what the secondary is designed for. Verification:

```kalk
I_z := 1.6 A
f := 50 Hz
C := 15000 μF
Q := I_z/(2·f)
ΔU := Q/C | V
U_m := 24.75 V
check "The charge over half a period gives the same swing": abs(ΔU - I_z/(2·f·C)) ≤ 0.000000001 V
check "The mean voltage lies at half the swing": abs(U_m - ΔU/2 - (U_m + (U_m - ΔU))/2) ≤ 0.000000001 V
```

The mean current through the diodes is half of the load current, because pairs of diodes alternate in carrying it. The reverse voltage of a diode is about the peak voltage, and the parts are chosen with a margin for mains fluctuations.

## Losses, efficiency and cooling {#T5}

Losses arise in the transformer (in the iron and in the winding), in the diodes of the bridge and in the ballast resistors. The input power from the mains is the output power plus the losses before the output, and the efficiency is the ratio of the useful LED power to the input power. The heat loss of the diodes is carried away by a heat sink, and the chip temperature is calculated from the thermal resistances in the chain chip, case, heat sink, ambient, like the voltage drop in a series connection of resistors.

```kalk
relation P_D == 2·U_F·I_z
relation P_in == P_out + P_D + P_Fe + P_Cu
relation η == P_LED/P_in
relation T_c == T_a + P_D·(R_cs + R_sa)
relation T_j == T_c + P_D·R_jc
relation R_sa_max == (T_jmax - T_a)/P_D - R_jc - R_cs
```

- A thermal resistance in K/W says by how many kelvins the temperature across it rises at a thermal power of 1 W.
- The largest allowed resistance of the heat sink follows from the condition that the chip temperature just reaches T_jmax. With this resistance the chain must give exactly T_jmax, which can be verified:

```kalk
P_D := 2.88 W
T_a := 50 °C
T_jmax := 100 °C
R_jc := 3 K/W
R_cs := 0.5 K/W
R_sa_max := (T_jmax - T_a)/P_D - R_jc - R_cs | K/W
T_j := T_a + P_D·(R_jc + R_cs + R_sa_max) | °C
check "With the largest heat sink resistance exactly T_jmax comes out": abs(T_j - T_jmax) ≤ 0.000001 K
```
