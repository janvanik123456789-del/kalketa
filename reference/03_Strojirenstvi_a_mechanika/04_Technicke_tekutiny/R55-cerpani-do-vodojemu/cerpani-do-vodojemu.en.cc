# Pumping water from a well into a water tower: pipe losses, operating point of the pump, power and filling of the tank
"An own task of Kalketa: A village draws water from a well and pumps it with a centrifugal pump through a pipe into a water tower. The calculation has four connected parts: first the pipe and its hydraulic losses, then the operating point of the pump in this pipe, then the motor input power with the daily energy consumption and its cost, and finally the filling and emptying of the tower. The numbers are chosen for teaching, the pictures are our own. The theory is in the Sources layer."
"Source: own task of Kalketa, no outside source."

## Pipe and hydraulic losses
### Problem
"A steel pipe leads vertically from the foot valve in the well to the pump and from the pump through a check valve and a gate valve into the tower. The route has four elbows. The pump is to deliver the design flow rate."
![Sketch of the pipe shape, not to scale: a vertical suction pipe with a foot valve leads to the pump P, followed by a check valve and a gate valve, then the delivery pipe with four elbows rises to the outlet into the tank; dimensions L_s and L_t, diameter DN 80](images/potrubi-schema.en.svg){width=75%}
Q_n := 10 L/s          ' design (required) flow rate
d := 80 mm             ' inside diameter of the pipe
k := 0.1 mm            ' absolute roughness of the wall (steel)
ν := 1.1e-6 m^2/s      ' kinematic viscosity of water
L_s := 6 m             ' length of the suction pipe
L_t := 95 m            ' length of the delivery pipe
n_k := 4               ' number of elbows
ζ_k := 0.9             ' loss coefficient of one elbow
ζ_p := 3.0             ' loss coefficient of the foot valve
ζ_z := 2.0             ' loss coefficient of the check valve
ζ_s := 0.2             ' loss coefficient of the gate valve
ζ_v := 1.0             ' loss coefficient of the outlet into the tank
g := 9.81 m/s^2        ' gravitational acceleration
"a) Calculate the mean velocity of the water in the pipe and the Reynolds number at the flow rate Q_n."
"b) Determine the friction factor λ and the friction loss along the whole pipe."
"c) Determine the sum of the local losses at the elbows, the valve, the check valve, the gate valve and the outlet."
"d) Calculate the total head loss h_z and from it the coefficient K for which h_z = K·Q² holds."

### Velocity and Reynolds number
"For a known flow rate Q the mean velocity is spread evenly over the whole cross-section, so v = Q/S. [T2]"
S := π·d^2/4 | cm^2          ' cross-section of the pipe
v := Q_n/S | m/s
![Longitudinal section of the pipe: the velocity profile is zero at the wall and largest on the axis (v_max); the vertical dashed line marks the mean velocity v](images/profil-rychlosti.en.svg){width=75%}
"The Reynolds number compares inertial and viscous forces; above about 4000 the flow is turbulent, which is the case in a water pipe. [T2]"
Re := v·d/ν {decimals=0}
check "Turbulent flow": Re ≥ 4000

### Friction loss
"The friction factor λ depends on the Reynolds number and the relative roughness k/d; for turbulent flow it is well given by the explicit relation of Swamee and Jain. [T2]"
λ := 0.25/log10(k/(3.7·d) + 5.74/Re^0.9)^2 {decimals=4}
"For comparison the Colebrook equation, which Kalketa solves for λ as an equation, and the Blasius relation for a smooth pipe (k = 0), which holds only up to Re ≐ 10⁵ and gives a lower bound: roughness increases the factor."
solve λ_C: 1/sqrt(λ_C) == -2·log10(k/(3.7·d) + 2.51/(Re·sqrt(λ_C))) in 0.005 .. 0.1
λ_Bl := 0.3164/Re^(1/4) {decimals=4}
check "Swamee–Jain differs from Colebrook by less than 1 %": abs(λ/λ_C - 1) ≤ 0.01
check "A rough pipe has a larger λ than a smooth one": λ > λ_Bl
"The friction loss grows with the length of the pipe and is proportional to the velocity head v²/(2g). [T2]"
L := L_s + L_t | m           ' total length of the pipe
h_f := λ·L/d·v^2/(2·g) | m

### Local losses and total loss
"Local obstacles (elbows, valve, check valve, gate valve, outlet) add local losses; each is proportional to the same velocity head and to its coefficient ζ. [T2]"
Σζ := n_k·ζ_k + ζ_p + ζ_z + ζ_s + ζ_v {decimals=1}
h_l := Σζ·v^2/(2·g) | m
"The total head loss is the sum of the friction loss and the local losses. [T2]"
h_z := h_f + h_l | m
"Since all the losses are proportional to v², hence to Q², the total loss can be written as h_z = K·Q²; the coefficient K is suited to the characteristic of the pipe. [T2]"
K_z := h_z/Q_n^2 | s^2/m^5
check "In a long pipe the friction loss exceeds the local ones": h_f > h_l
"The pipe is long, so the friction loss exceeds the local losses; of the local obstacles the foot valve takes the most."

## Pump: head and operating point
### Problem
"The pump stands above the water level in the well. The tower stands on a supporting structure and water is pumped into it up to the highest level. The loss coefficient K of the pipe is the result of the first part. Two points of the pump characteristic are known from the catalogue."
![Vertical section of the system: a well with a foot valve and a suction pipe to the pump P in a house at ground level, a delivery pipe to the water tower; dimensions h_s, h_v, h_max and H_g](images/studna-vodojem.en.svg){width=75%}
h_s := 3 m             ' height of the pump axis above the water level in the well
h_v := 22 m            ' height of the tank bottom of the tower above the pump
h_max := 4 m           ' highest water level above the tank bottom
H_0 := 46 m            ' head of the pump at zero flow
Q_1 := 12 L/s          ' flow rate of the second catalogue point
H_1 := 36 m            ' head of the pump at the flow rate Q_1
Q_min := 9 L/s         ' smallest required flow rate of the pump
"a) Calculate the static head H_g that the pump must overcome when the tank is full."
"b) From the two catalogue points determine the coefficient a of the pump characteristic H = H_0 − a·Q²."
"c) Write the pipe characteristic H = H_g + K·Q² with the value of K from the first part."
"d) Determine the operating point: the flow rate Q_b and the head H_b, and verify whether Q_b is greater than Q_min."

### Characteristics
"The static head is the total difference in height between the water level in the well (below the pump) and the highest level in the tower, which the pump must overcome. [T3]"
H_g := h_s + h_v + h_max | m
"The characteristic of a centrifugal pump can be approximated in the working range by the parabola H = H_0 − a·Q²; the coefficient a is determined from the second catalogue point. [T3]"
a := (H_0 − H_1)/Q_1^2 | s^2/m^5
H_p(Q) := H_0 - a·Q^2 | m
"The pipe has a characteristic that starts at the static head and grows with the square of the flow rate. [T3]"
H_t(Q) := H_g + K_z·Q^2 | m
check "The pump characteristic passes through the second catalogue point": abs(H_p(Q_1) - H_1) ≤ 0.001 m

### Operating point
"The operating point is the intersection of the two characteristics, H_p(Q) = H_t(Q). [T3]"
relation H_0 - a·Q^2 == H_g + K_z·Q^2 {eq}
derive Q_b == sqrt((H_0 − H_g)/(a + K_z)) {eq}
Q_b := sqrt((H_0 − H_g)/(a + K_z)) | L/s
"Substituting the operating flow rate into either characteristic gives the head at the operating point."
H_b := H_p(Q_b) | m
check "The two characteristics intersect at the operating point": abs(H_t(Q_b) - H_b) ≤ 0.001 m
check "Flow rate greater than the minimum": Q_b ≥ Q_min
check "The operating point lies within the catalogue range (Q_b ≤ Q_1)": Q_b ≤ Q_1
plot(H_p(Q), H_t(Q), Q: 0 L/s .. 16 L/s, points: [Q_b, H_b], title: "Pump and pipe characteristics, operating point") | m

### Checking that K is constant
"We determined the coefficient K at the design flow rate Q_n, but the operating flow rate is different and the Reynolds number and λ change slightly with it. So we recalculate the losses at the operating flow rate."
v_b := Q_b/S | m/s
Re_b := v_b·d/ν {decimals=0}
λ_b := 0.25/log10(k/(3.7·d) + 5.74/Re_b^0.9)^2 {decimals=4}
h_zb := (λ_b·L/d + Σζ)·v_b^2/(2·g) | m
K_b := h_zb/Q_b^2 | s^2/m^5
check "The coefficient K changed by less than 1 % between Q_n and Q_b": abs(K_b/K_z - 1) ≤ 0.01
"The coefficient K hardly changes, so the operating point is determined with sufficient accuracy."

## Electric motor: input power, energy consumption and cost
### Problem
"The pump works at the operating point from the second part and is driven by an electric motor on a common shaft. The village needs to pump the given volume of water every day and pays for the electric energy taken."
![An electric motor joined by a coupling to a centrifugal pump P on a common base plate; arrows P_el into the motor, P_h on the shaft, η_m at the motor, direction of the water flow](images/motor-cerpadlo.en.svg){width=75%}
ρ := 1000 kg/m^3       ' density of water
η_č := 0.70            ' efficiency of the pump at the operating point
η_m := 0.90            ' efficiency of the electric motor
V_d := 100 m^3         ' volume of water pumped per day
c_e := 5.5 CZK/kWh     ' price of electric energy
"a) Calculate the hydraulic power P_hyd delivered to the water at the flow rate Q_b and the head H_b."
"b) Determine the shaft power P_h and the electric input power P_el of the motor."
"c) How long per day must the pump run to pump the volume V_d?"
"d) Calculate the daily consumption of electric energy and its cost."

### Powers
"The pump gives the water a hydraulic power, which is the product of the weight delivered per second and the head. [T4]"
P_hyd := ρ·g·Q_b·H_b | kW
"A larger power is needed on the shaft because the pump has losses, and a still larger one from the mains because the motor has losses too. [T4]"
P_h := P_hyd/η_č | kW
P_el := P_h/η_m | kW
![Power flow from left to right: a wide band P_el enters the motor, a narrower P_h goes to the pump and the narrowest P_hyd leaves into the water; the motor and pump losses leave as heat](images/tok-vykonu.en.svg){width=75%}
η := η_č·η_m {decimals=2}
check "The overall efficiency agrees with the ratio of the powers": abs(P_hyd/P_el - η) ≤ 1e-9

### Running time, energy and cost
"The running time of the pump is the volume divided by the flow rate. [T4]"
t_c := V_d/Q_b | h
"The consumption of electric energy is the input power times the running time and the cost is the consumption times the unit price. [T4]"
E_d := P_el·t_c | kWh
N_d := E_d·c_e | CZK
"The energy can also be calculated from the work needed to lift the whole volume by the head, without the flow rate and the power:"
E_2 := ρ·g·V_d·H_b/η | kWh
check "The energy from the power and from the work agree": abs(E_d - E_2) ≤ 1e-6 kWh
e_m := E_d/V_d | kWh/m^3
"The specific consumption is the electric energy per cubic metre of pumped water; it is the value by which pumping stations are compared with one another."

## Water tower: filling time and drop of the level
### Problem
"The tower is a cylindrical tank. The pump fills it with the flow rate Q_b from the second part while the village draws water. In the evening peak the pump does not run and the level falls. The highest level h_max is the same as in the second part."
![Section of the cylindrical tank: water and air, a solid line for the highest level, a dashed one for the lowest level, dimensions h_max, h_min and the diameter D; inlet from the pump and draw-off to the network](images/vodojem-rez.en.svg){width=75%}
D := 6 m               ' inside diameter of the tank
h_min := 1 m           ' lowest permitted level above the bottom
q_p := 1.2 L/s         ' average draw-off during filling
q_v := 4 L/s           ' draw-off in the evening peak
"a) Calculate the cross-sectional area of the tank and the useful volume between the levels h_min and h_max."
"b) How long does it take to fill the tank from h_min to h_max when the pump runs at the flow rate Q_b and the village draws q_p?"
"c) How long does it take for the level to fall from h_max to h_min at the draw-off q_v without pumping? What is the rate of fall of the level in m/h?"
"d) How many times a day must the tank be filled to suffice for the daily volume V_d from the third part?"

### Useful volume
"The cross-sectional area of a cylindrical tank is S_n = πD²/4 and the useful volume is the product of this area and the difference of the highest and the lowest level. [T5]"
S_n := π·D^2/4 | m^2
V_u := S_n·(h_max - h_min) | m^3

### Filling and emptying
"The level changes according to the difference of inflow and outflow; if the inflow is larger, the level rises. During filling the inflow is Q_b and the draw-off q_p. [T5]"
check "During filling the level rises (Q_b > q_p)": Q_b > q_p
t_n := V_u/(Q_b - q_p) | h
"In the evening peak the pump does not run and the level falls by the draw-off q_v. The rate of fall is the draw-off divided by the area of the tank. [T5]"
t_v := V_u/q_v | h
w_h := q_v/S_n | m/h
check "The rate of fall and the emptying time agree (w_h·t_v = h_max − h_min)": abs(w_h·t_v - (h_max - h_min)) ≤ 1e-9 m
"The level during one cycle, that is filling by the pump and then the fall by the evening draw-off:"
h_c(t) := if(t ≤ t_n, h_min + (Q_b - q_p)/S_n·t, h_max - q_v/S_n·(t - t_n)) | m
plot(h_c(t), t: 0 h .. t_n + t_v, title: "Level in the tower during one cycle") | m

### Number of fillings per day
"The number of fillings per day is the daily consumption divided by the useful volume of the tank, rounded up. [T5]"
n_p := V_d/V_u {decimals=2}
n_pl := ceil(n_p)
check "The tank does not suffice for the daily consumption with one filling": V_u < V_d
"The tank holds less than the daily consumption, so it must be filled several times a day; the pump works for only a part of the day."
