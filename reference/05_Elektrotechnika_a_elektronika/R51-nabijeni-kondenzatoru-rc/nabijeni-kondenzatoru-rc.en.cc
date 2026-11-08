# Charging a capacitor through a resistor: time constant, current, voltage and energy
"An own task of Kalketa: a discharged capacitor is charged from a DC voltage source through a resistor after a switch is closed. The voltage across the capacitor rises and the current in the circuit falls. We look for the time constant, the current at the instant of switching and at time t_1, the capacitor voltage at time t_1, the time to charge to 90 % of the source voltage and the energy of the fully charged capacitor. The source is ideal, the components are linear, the switch closes without bounce. The theory is in the Sources layer. The pictures are our own."
"Source: own task of Kalketa; verified by the energy balance (heat in the resistor) and independently in Python (Check in Python layer)."

## Input
U := 12 V              ' source voltage
R := 4.7 kΩ            ' resistance of the resistor
C := 220 μF            ' capacitance of the capacitor
t_1 := 1 s             ' time after the switch is closed
![Circuit diagram: DC voltage source U, switch S, resistor R and capacitor C connected in series. The arrow i shows the direction of the current, the arrow u_C the voltage across the capacitor.](images/schema.svg){width=75%}

## Task
"a) Calculate the time constant of the circuit."
"b) What current flows in the circuit at the instant of switching and at time t_1?"
"c) What is the capacitor voltage at time t_1?"
"d) How long does it take to charge the capacitor to 90 % of the source voltage, and what energy does it hold when fully charged?"

## Time constant (part a)
"After the switch is closed the source voltage divides between the resistor and the capacitor (Kirchhoff's voltage law) [T2]."
relation U == R·i + u_C  {eq=Kirs}
"The current charges the capacitor, so it is proportional to the rate at which the capacitor voltage rises [T2]."
relation i == C·du_C/dt  {eq=Proud}
"Substituting the current into the voltage equation gives a single equation for the voltage. The product R·C stands at the derivative and sets the speed of the process [T2]."
derive R·C·du_C/dt + u_C == U
"The solution of this equation is an exponential and its time scale is exactly the product R·C [T3]."
relation τ == R·C  {eq=Tau}
τ := R·C | s {decimals=3}
"After one time constant the voltage reaches this fraction of its final value. After five time constants the process is practically over; the remainder is given below [T3]."
q_1 := 1 - exp(-1) | % {decimals=1}
q_5 := exp(-5) | % {decimals=2}

## Current at switching and at time t_1 (part b)
"A discharged capacitor has zero voltage at the start. At that moment it acts as a short circuit and the whole source voltage appears across the resistor. The current is therefore largest at the start, limited only by the resistor [T3]."
I_0 := U/R | mA {decimals=3}
"The current then falls exponentially with the time constant τ [T3]."
relation i(t) == U/R·exp(-t/τ)  {eq=ProudT}
![Graph of the current in the circuit after the switch is closed. The current starts at U/R and falls exponentially to zero; after one time constant τ it is at 37 % of the initial value. Multiples of τ are marked on the horizontal axis.](images/proud.en.svg){width=75%}
"At time t_1 we substitute the ratio t_1/τ into the exponent; its value k_1 says what part of the initial current still flows."
k_1 := exp(-t_1/τ)
i_t1 := U/R·exp(-t_1/τ) | mA {decimals=3}
plot(U/R·exp(-x/τ), x: 0 s .. 5·τ, title: "Current in the circuit after switching", ylim: 0 mA .. 3 mA, points: [t_1, i_t1]) | mA
"Time t_1 is slightly shorter than one time constant, so the current has fallen only to somewhat more than three fifths of its initial value."
check "At time t_1 less than one time constant has passed": t_1 ≤ τ
check "The current is largest at the start": i_t1 ≤ I_0

## Capacitor voltage at time t_1 (part c)
"The capacitor charges from zero and its voltage approaches the source voltage. It rises along the same exponential along which the current falls; both processes have the same time scale τ [T3]."
relation u_C(t) == U·(1 - exp(-t/τ))  {eq=UCt}
![Graph of the capacitor voltage u_C after the switch is closed. The voltage rises from zero exponentially to the source voltage U; after one time constant τ it reaches 63 % of U. Multiples of τ are marked on the horizontal axis.](images/napeti.en.svg){width=75%}
"At the instant of switching the capacitor is discharged. Its voltage starts at zero and can grow at most to the source voltage, never beyond it [T3]."
relation u_C(0) == 0 V  {eq=UC0}
"At time t_1 the exponent holds the same factor k_1 as for the current."
u_C_t1 := U·(1 - k_1) | V {decimals=3}
"The resistor carries the remainder up to the source voltage."
u_R_t1 := U - u_C_t1 | V {decimals=3}
podil_t1 := u_C_t1/U | % {decimals=1}
plot(U·(1 - exp(-x/τ)), x: 0 s .. 5·τ, title: "Capacitor voltage after switching", ylim: 0 V .. 12 V, points: [t_1, u_C_t1]) | V
"At time t_1 the capacitor holds slightly less than two thirds of the source voltage, so a little less than it would after a whole time constant. The rest of the voltage is across the resistor, so a current still flows and keeps charging the capacitor."
check "The capacitor voltage is below the source voltage": u_C_t1 ≤ U
check "The capacitor voltage at time t_1 is below the value after one time constant": u_C_t1 ≤ U·(1 - exp(-1))
check "Kirchhoff's voltage law at time t_1": abs(R·i_t1 + u_C_t1 - U) ≤ 1e-9 V

## Charging to 90 % and the energy (part d)
"The capacitor voltage rises along an exponential. The time to reach a fraction k of the source voltage follows by inverting this exponential [T3]."
relation t == -τ·ln(1 - k)  {eq=Doba}
"We require nine tenths of the source voltage, so we substitute k_90."
k_90 := 0.9
t_90 := -τ·ln(1 - k_90) | s {decimals=3}
n_90 := t_90/τ
"The charging time to 90 % is a multiple of the time constant given only by the number k, not by the values of the components. It is more than two time constants but less than five."
check "Within five time constants": t_90 ≤ 5·τ
check "Back-substitution: at time t_90 the voltage is nine tenths of the source voltage": abs(U·(1 - exp(-t_90/τ)) - k_90·U) ≤ 1e-9 V
"A charged capacitor stores energy in its electric field; we find it from the capacitance and the source voltage [T4]."
relation W == C·U^2/2  {eq=Energie}
W := C·U^2/2 | mJ {decimals=2}
"Check by another way: the heat in the resistor is the integral of the power loss R·i² over the whole charging. The upper limit 20·τ is practically infinity."
Q_R := integral(R·(U/R·exp(-t/τ))^2, t: 0 s .. 20·τ) | mJ {decimals=2}
check "The heat in the resistor equals the energy of the capacitor": abs(Q_R - W) ≤ 1e-6·W
"A source of voltage U delivers the charge C·U during charging, so the energy C·U², which is twice the energy of the capacitor. One half is stored in the capacitor, the other half turns into heat in the resistor, independently of its resistance."
W_zdroj := C·U·U | mJ {decimals=2}
check "The source delivered the energy of the capacitor and of the resistor": abs(W_zdroj - W - Q_R) ≤ 1e-6·W
plot(U·(1 - exp(-x/τ)), x: 0 s .. 5·τ, title: "Charging to 90 % of the source voltage", ylim: 0 V .. 12 V, points: [t_90, k_90·U]) | V
"The capacitor reaches ninety percent of the source voltage after a time longer than two time constants but shorter than five. When fully charged it holds the energy W; an equal energy turned into heat in the resistor during charging."
