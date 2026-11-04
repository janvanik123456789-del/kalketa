# Currents and voltages of a series-parallel RLC circuit
"Based on section 5.4 Series-parallel R, L, and C of Lessons In Electric Circuits, Vol. II – AC (T. R. Kuphaldt, Design Science License; the numbers and the task are used, the text and the drawings are our own): an AC source of 120 V, 60 Hz feeds a capacitor C_1 in series with the parallel combination of a resistor R and a branch of an inductor L and a capacitor C_2. We find the impedance of the circuit, the currents and voltages on all elements and the power. The source assumes ideal elements and gives phasors as rms values; we take the source voltage with zero phase."
"Source: T. R. Kuphaldt, Lessons In Electric Circuits, Vol. II – AC, section 5.4, https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC.pdf"

## Input
E := 120 V            ' rms voltage of the source, phase 0
f := 60 Hz
C_1 := 4.7 μF
L := 650 mH
R := 470 Ω
C_2 := 1.5 μF
![Circuit diagram: source E, capacitor C_1 in series, after node A the resistor R in parallel with the branch L – C_2, back through node B](images/schema.en.svg){width=80%}

## Impedances of the elements
"Angular frequency of the source:"
ω := 2·π·f | rad/s
"The impedance of a capacitor is negative imaginary (the current leads the voltage), that of an inductor positive imaginary, that of a resistor real:"
Z_C1 := -1j/(ω·C_1) | Ω
Z_L := 1j·ω·L | Ω
Z_C2 := -1j/(ω·C_2) | Ω
Z_R := R

## Total impedance
"The branch L – C_2 is a series connection, so the impedances add:"
Z_LC2 := Z_L + Z_C2 | Ω
"The resistor and the branch L – C_2 are in parallel, so the reciprocals add:"
Z_p := 1/(1/Z_R + 1/Z_LC2) | Ω
"The total impedance is the capacitor C_1 in series with the parallel part:"
Z := Z_C1 + Z_p | Ω {polar}
Z_abs := abs(Z) | Ω
φ_Z := arg(Z) | °

## Currents and voltages
"The current from the source and the voltages on C_1 and on the parallel part:"
I := E/Z | mA {polar}
E_C1 := I·Z_C1 | V {polar}
E_p := I·Z_p | V {polar}
"The current through the resistor and through the branch L – C_2 from the voltage on the parallel part:"
I_R := E_p/Z_R | mA {polar}
I_LC2 := E_p/Z_LC2 | mA {polar}
"The voltages on the inductor and on the capacitor C_2:"
E_L := I_LC2·Z_L | V {polar}
E_C2 := I_LC2·Z_C2 | V {polar}
I_abs := abs(I) | mA
E_C1_abs := abs(E_C1) | V
E_p_abs := abs(E_p) | V
I_R_abs := abs(I_R) | mA
I_LC2_abs := abs(I_LC2) | mA
E_L_abs := abs(E_L) | V
E_C2_abs := abs(E_C2) | V
check "Kirchhoff's voltage law": abs(E_C1 + E_p - E) ≤ 1e-9 V
check "Kirchhoff's current law": abs(I_R + I_LC2 - I) ≤ 1e-9 mA

## Power
"The circuit is capacitive, so the angle of the impedance is negative and the current leads the voltage; the power factor:"
cos_φ := cos(arg(Z))
"The complex power of the source S = E·I*, its real part is the active power:"
S := E·conj(I) | VA
P := re(S) | W
"The active power turns into heat only in the resistor:"
P_R := abs(I_R)^2·R | W
check "Active power of the source = power in the resistor": abs(P - P_R) ≤ 1e-9 W

"The circuit with a total impedance of about 818 Ω draws about 147 mA from the source, leading the voltage by 58.4°. Most of the source voltage is on C_1 (82.8 V) and on the parallel part (65.9 V); the phasors add up to exactly 120 V. The active power of 9.23 W is produced only in the resistor. The numbers agree with the source to all the digits it gives; the source states the angle of the inductor as 221.22°, which is the same angle as −138.78°."
