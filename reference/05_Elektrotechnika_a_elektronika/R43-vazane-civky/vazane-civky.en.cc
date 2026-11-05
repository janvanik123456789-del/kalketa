# Currents and power of two magnetically coupled coils with a load
"Own task: a primary coil is connected to a source of 230 V, 50 Hz. A secondary coil with a load R_z is magnetically coupled to it. We look for the phasors of both currents, the active power and the efficiency of the transfer. The mutual inductance couples both equations, so a system with complex coefficients arises. The coils are linear, without iron losses. The picture is our own."
"Source: own task, verified by the reflected impedance (section 4 of the sheet) and independently in Python (Check in Python layer)."

## Input
U := 230 V               ' rms value, phase 0
f := 50 Hz
R_1 := 2 Ω               ' resistance of the primary winding
L_1 := 40 mH             ' inductance of the primary winding
R_2 := 1 Ω               ' resistance of the secondary winding
L_2 := 10 mH             ' inductance of the secondary winding
M := 15 mH               ' mutual inductance
R_z := 6 Ω               ' load
![Diagram: source U, primary winding R_1, L_1, mutual inductance M, secondary winding L_2, R_2 and load R_z](images/schema.svg){width=75%}

## Impedances
ω := 2·π·f | rad/s
k := M/sqrt(L_1·L_2)
Z_1 := R_1 + 1j·ω·L_1 | Ω
Z_2 := R_2 + R_z + 1j·ω·L_2 | Ω
Z_M := 1j·ω·M | Ω

## Mesh equations
"Kirchhoff's voltage law holds for each mesh. The term with M is the voltage induced by the current of the other coil; its sign follows the dots of the windings in the picture. The matrix is complex and lsolve solves it directly."
Z_s := [Z_1, -Z_M | -Z_M, Z_2]
I := lsolve(Z_s, [U | 0 V])
I_1 := I[1] | A {polar}
I_2 := I[2] | A {polar}
I_1a := abs(I_1) | A
I_2a := abs(I_2) | A
φ_1 := arg(I_1) | rad

## Power
S := U·conj(I_1) | VA
P := re(S) | W
Q := im(S) | W
P_1 := R_1·I_1a^2 | W
P_2 := R_2·I_2a^2 | W
P_z := R_z·I_2a^2 | W
η := P_z/P | %

## Check by the reflected impedance
"I_2 is expressed from the second equation and put into the first. The secondary thus appears in the primary as the impedance (ω·M)²/Z_2 and the current I_1 comes out without a matrix."
Z_v := Z_1 + (ω·M)^2/Z_2 | Ω
I_1v := U/Z_v | A {polar}

## Power in the load by its resistance
"The same elimination of I_2 gives the power in the load as a function of its resistance. The chart shows the power first growing with the resistance and then falling."
P_zat(R_x) := R_x·(ω·M·U/abs(Z_1·(R_2 + R_x + 1j·ω·L_2) + (ω·M)^2))^2
plot(P_zat(R_x), R_x: 0.5 Ω .. 40 Ω, title: "Power in the load by the resistance of the load", xlabel: "R_z", ylabel: "P_z") | W

## Checks
check "The active power of the source equals the losses and the power in the load": abs(P - P_1 - P_2 - P_z) ≤ 0.001 W
check "Current I_1 as from the reflected impedance": abs(I_1 - I_1v) ≤ 0.000001 A
check "The solution satisfies the equation of the first mesh": abs(Z_1·I_1 - Z_M·I_2 - U) ≤ 0.000001 V
check "The function of power gives the same value at R_z": abs(P_zat(R_z) - P_z) ≤ 0.001 W
check "Coupling factor at most 1": k ≤ 1
"The primary carries 18.7 A and the secondary 11.5 A. Of the 1625 W of active power, 793 W goes to the load, an efficiency of 48.8 %. The rest is lost mainly in the resistance of the primary winding, which carries a large magnetising current."
