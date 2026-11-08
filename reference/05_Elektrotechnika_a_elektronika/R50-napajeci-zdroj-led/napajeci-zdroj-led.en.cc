# Design of a 24 V mains power supply for LED lighting
"An own task of Kalketa: LED lighting is to be powered from the 230 V mains by a 24 V direct-current supply. The supply consists of a transformer, a bridge rectifier and a filter capacitor; the LEDs are connected in several parallel strings with ballast resistors. The parts follow each other: the results of each one enter the next. We assume a sinusoidal mains voltage, ideal diodes with a constant voltage drop, a load drawing a constant current and a linear fall of the capacitor voltage between the peaks. The pictures are our own. The theory is in the Sources layer."
"Source: own task of Kalketa, no outside source; verified independently in Python (Check in Python layer) and in each part by a balance of powers, voltages or temperatures."

## LED load
![](images/zatez-led.en.svg){width=75% alt="Wiring diagram of the LEDs: two horizontal rails, the upper +U_dc and the lower 0 V, with the source on the left and several vertical branches side by side between them. Each branch has a resistor R_s at the top and below it a series of N_s LEDs with voltage U_f; the current I_s flows through it. Three dots stand between the second and the third branch, and the label n_s parallel strings is above the branches."}
### Input
"The lighting consists of several identical strings of LEDs connected in parallel. Each string has its own ballast resistor, which sets the rated LED current at the supply voltage."
N_s := 7              ' number of LEDs in one string
U_f := 3.0 V          ' forward voltage of one LED at the rated current
I_s := 0.2 A          ' rated current of one string
n_s := 8              ' number of parallel strings
U_dc := 24 V          ' required direct voltage of the supply
"a) Calculate the voltage of one LED string and the total load current."
"b) How large must the ballast resistor in each string be, and what power is wasted in it?"
"c) Calculate the power of all LEDs, the total output power of the supply and the power wasted in all resistors together."
### String voltage and total current (a)
"An LED behaves like a diode with an almost constant forward voltage, but its current rises very steeply with voltage. That is why LEDs are driven by a current, and each string gets a ballast resistor that takes over the rest of the supply voltage and sets the current." [T2]
"The LEDs of one string are in series, so their forward voltages add up. The direct voltage of the supply stands on the whole branch (resistor and string), but the voltage of the string itself is only the sum of the LED voltages." [T2]
relation U_s == N_s·U_f {eq=Retezec}
U_s := N_s·U_f | V
"Parallel branches have the same voltage, but each draws its own current from the supply – the total current is the sum of the currents of all strings." [T2]
relation I == n_s·I_s {eq=Proud}
I := n_s·I_s | A
### Ballast resistor and its loss (b)
"What remains on the ballast resistor is the supply voltage minus the string voltage; the string current flows through the resistor, so Ohm's law gives its size." [T2]
relation R_s == (U_dc - U_s)/I_s {eq=Odpor}
R_s := (U_dc - U_s)/I_s | Ω
"The power wasted in the resistor is proportional to the square of the string current – it is the price of a stable current." [T2]
relation P_R == I_s²·R_s {eq=Ztrata}
P_R := I_s²·R_s | W
check "The supply is enough for a whole string (a positive voltage remains on the resistor)": U_dc > U_s
### Powers of the LEDs, of the output and of all resistors (c)
"The power of one LED is its voltage times its current; the power of a string is calculated as the string voltage times the current."
P_LED1 := U_f·I_s | W
P_Ret := U_s·I_s | W
"The power of all LEDs is the power of one string times the number of branches (the same as N_s·n_s diodes with the power of one LED)." [T2]
P_LED := P_Ret·n_s | W
"The total output power of the supply is the supply voltage times the total current." [T2]
relation P_out == U_dc·I {eq=Vystup}
P_out := U_dc·I | W
"The power in all resistors together is the loss of one resistor times the number of branches."
P_Rs := n_s·P_R | W
"We check that the output power equals the sum of the powers of the LEDs and the resistors (conservation of energy)."
check "Power balance": abs(P_out - P_LED - P_Rs) ≤ 0.000001 W
check "The power of one LED times their number gives the power of all LEDs": abs(N_s·n_s·P_LED1 - P_LED) ≤ 0.000001 W
"The ratio of the LED power to the output power shows how efficient the ballast resistors are (without the transformer and the diodes)."
η_out := P_LED/P_out
"The chart shows why as many LEDs as possible are put in a string: the closer the string voltage is to the supply voltage, the less power the resistors waste. With eight LEDs no voltage would be left on the resistor and nothing would control the current, so seven LEDs is the largest sensible number."
η_N(N_x) := N_x·U_f/U_dc
plot(η_N(N_x), N_x: 1 .. 7, points: [N_s, η_out], title: "Efficiency of the ballast resistors by number of LEDs in a string", xlabel: "N_s", ylabel: "η_out")
"A string with the largest possible number of LEDs uses most of the supply voltage; the rest turns into heat in the resistors, which is the price of a steady current."

## Transformer
![](images/transformator.en.svg){width=75% alt="Diagram of a transformer with an iron core and a window in the middle. On the left limb is the blue primary winding with voltage U_1 and current I_1, on the right limb the red secondary winding with voltage U_2 and current I_2. A green dashed loop Φ marks the magnetic flux in the core; below the picture are the numbers of turns N_1 and N_2."}
### Input
"The supply from the previous part is to deliver the voltage U_dc and the current I. The transformer, fed from the 230 V / 50 Hz mains, must give on the secondary side an alternating voltage from which the bridge with the filter capacitor makes the same 24 V direct voltage. The mean voltage on the capacitor lies half the ripple below its peak, and a voltage drop always arises on the two conducting diodes of the bridge."
U_z := U_dc           ' direct voltage of the load (from the first part)
I_z := I              ' direct current of the load (from the first part)
U_1 := 230 V          ' primary voltage from the mains
f := 50 Hz            ' mains frequency
U_F := 0.9 V          ' voltage drop on one conducting diode
ΔU_max := 1.5 V       ' allowed ripple swing on the capacitor
d_u := 0.06           ' relative drop of the secondary voltage under load against no load
k_I := 1.8            ' ratio of the rms secondary current to the direct load current
B_m := 1.2 T          ' largest magnetic flux density in the core
A_Fe := 9 cm^2        ' iron cross-section in the core limb
"a) What peak voltage must the secondary winding have so that the mean voltage on the capacitor is U_z at the ripple ΔU_max?"
"b) Determine the rms secondary voltage under load, the no-load voltage and the turns ratio of the transformer."
"c) Calculate the rms secondary current, the apparent power of the transformer and the primary current."
"d) How many turns must the primary and the secondary winding have for the given core? Use the equation U = 4.44·f·N·B_m·A_Fe."
"The transformer transfers power by an alternating magnetic flux in the core; the voltage of a winding is proportional to its number of turns. The secondary must give a sufficient peak so that the capacitor reaches the required direct voltage after rectification." [T3]
### Peak voltage of the secondary winding (a)
"The capacitor is charged to the peak of the rectified voltage, but the load draws current from it also between the peaks, so its mean voltage lies half the swing below the peak. In each half-wave, moreover, two diodes of the bridge conduct and take away two voltage drops. The peak of the secondary must therefore cover U_z, half the ripple and both drops. The ripple is taken here at its allowed limit ΔU_max, so that the mean voltage on the capacitor comes out exactly U_z." [T3]
relation U_2m == U_z + ΔU_max/2 + 2·U_F {eq=Spicka}
U_2m := U_z + ΔU_max/2 + 2·U_F | V
### Rms voltage under load, no-load voltage and ratio (b)
"The rms value of a sinusoidal voltage is smaller than its peak by the square root of two. Under load the winding voltage drops against the no-load state; the no-load voltage is therefore higher. The turns ratio is the ratio of the primary voltage to the no-load voltage, because that corresponds to the ratio of the numbers of turns." [T3]
relation U_2 == U_2m/sqrt(2) {eq=Efektivni}
U_2 := U_2m/sqrt(2) | V
relation U_20 == U_2/(1 - d_u) {eq=Naprazdno}
U_20 := U_2/(1 - d_u) | V
relation n == U_1/U_20 {eq=Prevod}
n := U_1/U_20
### Currents and apparent power (c)
"The capacitor draws current only in short peaks, so the rms current of the winding is larger than the direct load current by the factor k_I. The apparent power of the transformer is the product of the rms voltage and the secondary current; the primary current follows from the same apparent power at the mains voltage (we neglect the magnetizing current and the losses)." [T3]
relation I_2 == k_I·I_z {eq=Proud2}
I_2 := k_I·I_z | A
relation S == U_2·I_2 {eq=VykonS}
S := U_2·I_2 | VA
relation I_1 == S/U_1 {eq=Proud1}
I_1 := S/U_1 | A
### Numbers of turns of both windings (d)
![](images/jadro.en.svg){width=75% alt="Section of a transformer core limb: in the middle a grey rectangle made of thin horizontal laminations of dimensions a and b, with the mark A_Fe inside. Around it is a yellow coil with orange circles representing the copper conductors of the winding in section."}
"The equation U = 4.44·f·N·B_m·A_Fe gives the number of turns from the size of the core; B_m is the largest permitted flux density so that the laminations do not saturate. We calculate the turns for the no-load voltage, which corresponds to the voltage on the terminals without a load. The number of turns has no unit." [T3]
relation U == 4.44·f·N·B_m·A_Fe {eq=Zavity}
"A winding has only whole turns. We round up: more turns at the same voltage mean a smaller flux density, so the core does not exceed B_m. For the secondary we insert the no-load voltage U_20:"
N_2 := ceil(U_20/(4.44·f·B_m·A_Fe))        ' number of turns of the secondary
"The primary winding is connected to the mains voltage U_1:"
N_1 := ceil(U_1/(4.44·f·B_m·A_Fe))         ' number of turns of the primary
### Check of the turns
"With the rounded numbers of turns the flux density in the core must stay below B_m, for both windings."
B_2 := U_20/(4.44·f·N_2·A_Fe) | T
B_1 := U_1/(4.44·f·N_1·A_Fe) | T
check "The flux density in the core by the secondary does not exceed B_m": B_2 ≤ B_m
check "The flux density in the core by the primary does not exceed B_m": B_1 ≤ B_m
"The numbers of turns must agree with the ratio – the quotient N_1/N_2 should equal the ratio n (the ratio of turns is the ratio of voltages). We rounded each winding up by less than one turn, so the quotient can deviate from the ratio by at most one turn of the secondary out of its total number, that is by 1/N_2. That is a reasonable limit: the winding allows no more accurate ratio than a whole secondary turn."
tol_N := 1/N_2
check "The ratio agrees with the numbers of turns (deviation at most one secondary turn)": abs(N_1/N_2 - n)/n ≤ tol_N
"The transformer must give on the secondary a voltage that produces U_z on the capacitor; the size of the core and the voltage then fix the numbers of turns, and the apparent power S is the measure of the size of the transformer, not the watts of the load."

## Rectifier and filter capacitor
![](images/usmernovac.svg){width=75% alt="Diagram of a bridge rectifier with four diodes D1 to D4 arranged in a rhombus. Inside is an alternating voltage source u_2 between nodes A and B; from the upper node marked plus the current i_d flows through the load R_z to the lower node marked minus. The arrow u_d at the load shows the output voltage."}
### Input
"The secondary voltage U_2 from the previous part is rectified by a Graetz bridge and smoothed by a capacitor. The load draws the current I_z from the first part. The mains frequency, the diode drop and the allowed ripple are the same as in the previous part. The design of the transformer counted on the mean voltage on the capacitor, so we use the same measure when we judge the result."
C_v := 15000 μF       ' chosen filter capacitor
k_u := 2              ' margin of the reverse voltage of the diodes
k_c := 1.25           ' margin of the rated voltage of the capacitor
"a) What is the peak voltage on the capacitor after rectifying the secondary voltage U_2?"
"b) What is the smallest capacitance for which the ripple swing does not exceed ΔU_max? Use the relation ΔU = I_z/(2·f·C)."
"c) What is the ripple swing with the chosen capacitor C_v, and the lowest and the mean voltage on the capacitor? Does the load get 24 V?"
"d) What mean current flows through each diode, what smallest reverse voltage of the diodes will you choose with the margin k_u and what smallest rated voltage of the capacitor with the margin k_c?"
![](images/usmernene-napeti.en.svg){width=75% alt="Graph of the voltage u_d in time after full-wave rectification: three arcs of a sine wave above the horizontal axis t, each lasting T/2 and reaching the peak U_m. A dashed red horizontal line marked U_str shows the mean value, which lies below the peak. Between the arcs the voltage falls to zero."}
"The Graetz bridge passes the current in the same direction in both half-waves; in each half-wave two diodes conduct in series with the load, so the peak is reduced by two drops." [T4]
### Peak voltage on the capacitor (a)
"The capacitor is charged to the top of the rectified voltage. That has the peak √2·U_2, from which the two drops of the conducting diodes are still subtracted." [T4]
relation U_m == sqrt(2)·U_2 - 2·U_F {eq=SipkaC}
U_m := sqrt(2)·U_2 - 2·U_F | V
### Smallest capacitance for the allowed ripple (b)
![](images/zvlneni.en.svg){width=75% alt="Graph of the capacitor voltage u_C in time: the blue curve always rises quickly to the value U_m and then falls slowly to the value U_min before the next arc of the rectified voltage charges it again. Faintly dashed arcs show the rectified voltage without the capacitor. A red double arrow ΔU at the right edge marks the swing between U_m and U_min."}
"Between the peaks the capacitor discharges into the load by an almost constant current, so the voltage falls approximately linearly. The swing is proportional to the current and inversely proportional to the capacitance and to the frequency of the rectified voltage, which is twice the mains frequency." [T4]
relation ΔU == I_z/(2·f·C) {eq=Zvlneni}
"From the condition that the swing must not exceed ΔU_max we get the smallest capacitance:"
solve C_min: ΔU_max == I_z/(2·f·C_min) | μF
### Ripple with the chosen capacitor and the voltage on it (c)
"With the chosen C_v we calculate the actual swing of the ripple." [T4]
ΔU_v := I_z/(2·f·C_v) | V
"The lowest voltage is the peak reduced by the whole swing; the mean lies half the swing below the peak." [T4]
relation U_min == U_m - ΔU {eq=Umin}
U_min := U_m - ΔU_v | V
relation U_str == U_m - ΔU/2 {eq=Ustr}
U_str := U_m - ΔU_v/2 | V
"What it means that the load gets U_z: in the previous part we designed the transformer for the mean voltage on the capacitor, so we judge the result in the same way – the mean voltage U_str decides. The lowest voltage U_min, just before recharging, is given only as information on the depth of the ripple: for a short time it can lie below U_z. If the load needed U_z even at the lowest point, the capacitor would have to be larger (see the chart)."
check "The mean voltage on the capacitor is at least U_z": U_str ≥ U_z
"The difference U_min − U_z is negative when the lowest voltage lies below U_z; here it is information, not a check."
Δ_min := U_min - U_z | V
check "The chosen capacitor is not smaller than the smallest capacitance": C_v ≥ C_min
check "The ripple with the chosen capacitor does not exceed ΔU_max": ΔU_v ≤ ΔU_max
"The chart shows how the mean and the lowest voltage change with the capacitance and where they cross U_z: the mean voltage is enough from a capacitance close to the smallest one, the lowest voltage would need a larger capacitance."
U_str_C(C_x) := U_m - I_z/(2·f·C_x)/2 | V
U_min_C(C_x) := U_m - I_z/(2·f·C_x) | V
plot(U_str_C(C_x), U_min_C(C_x), U_z, C_x: 8000 μF .. 30000 μF, title: "Mean and lowest voltage on the capacitor by capacitance", xlabel: "C", ylabel: "U") | V
### Diode current, reverse voltages of the diode and the capacitor (d)
"The mean current through the diodes is half of the load current, because pairs of diodes alternate in carrying it." [T4]
relation I_D == I_z/2 {eq=ID}
I_D := I_z/2 | A
"The reverse voltage of a diode is about the peak voltage, and the parts are chosen with a margin for mains fluctuations." [T4]
relation U_RRM == k_u·U_m {eq=RRM}
U_RRM := k_u·U_m | V
relation U_C == k_c·U_m {eq=UC}
U_C := k_c·U_m | V
"The capacitor is charged to the peak and discharges into the load between the peaks; the ripple comes out smaller than what we allow, and the diodes and the capacitor are chosen with a margin above the peak."

## Losses and temperature rise
![](images/tok-vykonu.en.svg){width=75% alt="Block diagram of the power flow: from the left the mains, the transformer, the rectifier with the capacitor, the ballast resistors R_s and the LED strings, joined by blue arrows labelled P_in, P_out and P_LED. From the blocks transformer, rectifier and resistors red arrows of the losses P_Fe + P_Cu, P_D and P_Rs lead down. On the right is the efficiency formula η = P_LED / P_in."}
### Input
"The supply from the previous parts has losses in the resistors, in the diodes of the bridge and in the transformer. The diodes sit in one package screwed onto an aluminium heat sink in a cabinet where the air is warmer. The current, the diode drop and the output power come from the previous parts; the powers P_out, P_LED and P_Rs are taken from the first part and not defined again."
P_Fe := 1.5 W         ' iron losses of the transformer
P_Cu := 3.2 W         ' winding losses of the transformer
T_a := 50 °C          ' air temperature in the cabinet
T_jmax := 100 °C      ' highest allowed operating temperature of the chip, with a margin
R_jc := 3 K/W         ' thermal resistance between the chip and the case of the rectifier
R_cs := 0.5 K/W       ' thermal resistance between the case and the heat sink (paste)
R_sa := 12 K/W        ' thermal resistance of the chosen heat sink to the ambient
"a) Calculate the power loss of the bridge diodes (two diodes always conduct) and the input power of the supply from the mains as the sum of the output power and the losses of the transformer and the diodes."
"b) What is the overall efficiency of the supply as the ratio of the LED power to the input power?"
"c) What is the largest thermal resistance the heat sink may have so that the chip temperature does not exceed T_jmax?"
"d) What will the temperature of the case and of the chip be with the chosen heat sink, and is it acceptable?"
"The power from the mains partly turns into heat on its way to the LEDs: in the iron and the winding of the transformer, in the diodes of the bridge and in the ballast resistors. The block diagram above shows the flow of power and of losses." [T5]
### Diode losses and input power (a)
"In each half-wave two diodes conduct in series and the whole load current flows through both; each holds the drop U_F, so the power of two drops times the current turns into heat in them." [T5]
relation P_D == 2·U_F·I_z {eq=ZtrataD}
P_D := 2·U_F·I_z | W
"The input power from the mains is the output power plus the losses before the output, that is in the transformer and in the diodes. The losses in the ballast resistors are already contained in the output power P_out." [T5]
relation P_in == P_out + P_D + P_Fe + P_Cu {eq=Prikon}
P_in := P_out + P_D + P_Fe + P_Cu | W
"Check by an energy balance: the input power equals the useful LED power plus all the losses (resistors, diodes, iron, winding)."
check "Power balance of the whole supply": abs(P_in - P_LED - P_Rs - P_D - P_Fe - P_Cu) ≤ 0.000001 W
### Overall efficiency of the supply (b)
"Only the power that the LEDs receive is useful; the efficiency is its share of the input power from the mains." [T5]
relation η == P_LED/P_in {eq=Ucinnost}
η := P_LED/P_in {digits=3}
### Largest allowed thermal resistance of the heat sink (c)
![](images/chladic.en.svg){width=75% alt="At the top is a section of a component screwed through a thin layer of paste to a finned heat sink, with a red arrow of the thermal power P_D pointing into the component. Labels mark the chip T_j, the case T_c and the heat sink surface T_s. At the bottom is a chain of thermal resistances R_jc, R_cs and R_sa between the nodes T_j, T_c, T_s and T_a, and the formula for the temperature T_j."}
"Heat passes from the chip step by step into the case, through the paste into the heat sink and from the heat sink into the air. The thermal resistances are in series, and the temperature at each grows with the thermal power like the voltage drop on resistors in series (see the picture of the heat sink)." [T5]
"The largest allowed resistance of the heat sink follows from the condition that the chip temperature just reaches T_jmax: the whole allowed temperature difference is divided among three resistances, and the heat sink gets what the chip and the paste do not use up." [T5]
relation R_sa_max == (T_jmax - T_a)/P_D - R_jc - R_cs {eq=Chladic}
R_sa_max := (T_jmax - T_a)/P_D - R_jc - R_cs | K/W
check "The heat sink is sufficient": R_sa ≤ R_sa_max
### Temperature of the case and of the chip with the chosen heat sink (d)
"The case is warmer than the air by the temperature rise on the paste and the heat sink, the chip by the rise on the resistance between the chip and the case besides." [T5]
relation T_c == T_a + P_D·(R_cs + R_sa) {eq=Tc}
T_c := T_a + P_D·(R_cs + R_sa) | °C
relation T_j == T_c + P_D·R_jc {eq=Tj}
T_j := T_c + P_D·R_jc | °C
check "Chip temperature": T_j ≤ T_jmax
"The chart shows the chip temperature by the thermal resistance of the heat sink; the chosen heat sink lies below the limit T_jmax, and the largest allowed resistance is where the line crosses the limit."
T_j_R(R_x) := T_a + P_D·(R_jc + R_cs + R_x) | °C
plot(T_j_R(R_x), T_jmax, R_x: 0 K/W .. 20 K/W, points: [R_sa, T_j], title: "Chip temperature by the thermal resistance of the heat sink", xlabel: "R_sa", ylabel: "T_j") | °C
"Most of the input power ends up in the LEDs, the rest turns into heat in the resistors, the transformer and the diodes; the chosen heat sink keeps the diode chip below the highest allowed temperature with a small margin to spare."
