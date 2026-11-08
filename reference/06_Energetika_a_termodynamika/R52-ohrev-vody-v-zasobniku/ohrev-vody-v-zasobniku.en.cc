# Time to heat water and time for it to cool in an electric storage tank
"An own task of Kalketa: an electric storage tank heats water from the mains with a heating element near the bottom. The vessel is wrapped in a layer of thermal insulation through which heat escapes into the room. We find how long it takes the water to reach the operating temperature, what heat flow the insulation lets through at that temperature, and how long the water takes to fall to a limit temperature after the heating is switched off. The theory is in the Sources layer. The pictures are our own."
"Source: own task, verified independently in Python (Check in Python layer) and in the sheet by the energy balance of the cooling and by heating with losses."

## Input
V := 120 L                 ' volume of water in the tank
ρ := 1000 kg/m^3           ' density of water
c := 4186 J/(kg·K)         ' specific heat capacity of water
P := 2 kW                  ' input power of the heating element
η := 0.95                  ' heating efficiency
t_1 := 12 °C               ' temperature of the mains water
t_2 := 60 °C               ' temperature of the water after heating
t_o := 20 °C               ' room temperature
t_c := 50 °C               ' limit temperature of the water after the heating is switched off
δ := 50 mm                 ' thickness of the insulation
λ := 0.025 W/(m·K)         ' thermal conductivity of the insulation
A := 2.4 m^2               ' area of the tank jacket
![Section of a hot water tank: a cylindrical vessel with water of volume V and temperature t_v, wrapped in a layer of insulation. Near the bottom is the coil of the heating element of input power P and the cold water inlet, at the top the hot water outlet.](images/rez-zasobniku.en.svg){width=75%}
"We look for:"
"a) How long does it take the water to heat from the temperature t_1 to the temperature t_2?"
"b) What heat flow escapes through the insulation at the water temperature t_2? The resistance of the steel wall and the heat transfer at the surfaces are neglected."
"c) How long after the heating is switched off does the water temperature fall to the limit temperature t_c?"

## Time to heat the water (task a)
"The mass of the water follows from its volume and density (m = ρ·V):" [T2]
m := ρ·V | kg
"Heating the mass m by a temperature difference takes heat proportional to the specific heat capacity. In the time τ_o the heating element supplies the heat η·P·τ_o (the efficiency η says that part of the input power is lost). The two heats are equal:" [T2]
relation Q == m·c·(t_2 - t_1) {eq=Qohrev}
relation η·P·τ_o == Q {eq=bilance}
"During heating we neglect the heat losses through the insulation, because they are small against the power of the element. The check and the more exact calculation below show that this is justified."
"The heat needed:"
Q := m·c·(t_2 - t_1) | MJ
"The heating time follows from the balance, τ_o = Q/(η·P):"
τ_o := Q/(η·P) == m·c·(t_2 - t_1)/(η·P) | min

## Heat flow through the insulation (task b)
![Temperature across the wall of the tank: from the left the water of temperature t_v, a thin steel wall, a thick layer of insulation of thickness δ and a thin jacket, on the right the surroundings of temperature t_o. The temperature falls linearly in the insulation, the arrow q shows the heat flow from the water to the surroundings.](images/teplota-ve-stene.en.svg){width=75%}
"A thin layer of insulation conducts heat in proportion to the temperature difference across it and inversely to its thickness. On a large vessel a thin layer can be treated as a plane one:" [T3]
relation Φ == λ/δ·A·(t_v - t_o) {eq=Fourier}
"We neglect the resistance of the steel wall and the heat transfer at the surfaces (water → wall, jacket → room), so the whole difference between water and surroundings falls across the insulation. The thermal transmittance of the layer and the conductance of the whole jacket:"
U_i := λ/δ | W/(m^2·K)
G := U_i·A | W/K
"The heat flow at the water temperature t_2:"
Φ_2 := λ/δ·A·(t_2 - t_o) == G·(t_2 - t_o) | W
"The share of this flow in the input power of the element:"
ratio_ztraty := Φ_2/P | %

## Time to cool after the heating is switched off (task c)
"Without heating the water loses heat exactly by the heat flow through the insulation. In the time dτ the water temperature falls by dt_v (dt_v is negative):" [T4]
relation m·c·dt_v == -λ/δ·A·(t_v - t_o)·dτ {eq=difrovn}
"The flow is proportional to the difference between the water and the surroundings, so the variables can be separated: dt_v/(t_v − t_o) = −dτ/T, where T = m·c/G. Integrating from t_2 at τ = 0 gives an exponential decay of the temperature difference with the time constant T:" [T4]
relation T == m·c·δ/(λ·A) {eq=Tkonst}
relation t_v - t_o == (t_2 - t_o)·exp(-τ/T) {eq=expon}
"The time constant is the ratio of the heat capacity of the water to the conductance of the jacket:"
T := m·c/G == m·c·δ/(λ·A) | h
"From the exponential we express the time in which the temperature falls from t_2 to t_c, τ_c = T·ln((t_2 − t_o)/(t_c − t_o)):"
τ_c := T·ln((t_2 - t_o)/(t_c - t_o)) | h
"The ratio of the cooling time to the heating time and to the time constant:"
poměr_ch := τ_c/τ_o
poměr_T := τ_c/T

## Heating with losses (check of the assumption)
"During heating the heat from the element is reduced by the flow through the insulation, which grows with the water temperature: m·c·dt_v/dτ = η·P − G·(t_v − t_o). The solution has the same form as the cooling, only it approaches the equilibrium difference η·P/G (the water would never reach it, the thermostat would switch off sooner):"
Δt_rov := η·P/G | K
t_vz(τ) := t_o + Δt_rov - (t_o + Δt_rov - t_1)·exp(-τ/T)
"The heating time from t_1 to t_2 with losses:"
τ_oz := T·ln((Δt_rov + t_o - t_1)/(Δt_rov + t_o - t_2)) | min
"How much the heating time is prolonged compared with the consideration without losses:"
prodlouzeni := (τ_oz - τ_o)/τ_o | %

## Temperature over time
![Chart of the water temperature in time. At the start the temperature rises linearly during heating, after the heating is switched off it falls along an exponential towards the room temperature t_o. A horizontal dashed line marks the limit temperature t_c, where the cooling curve crosses it.](images/prubeh-teploty.en.svg){width=75%}
"The sketch shows both processes one after another, the times in it are not to scale: heating takes hours, cooling tens of hours. During heating the temperature rises linearly (constant power, no losses), after switching off it falls exponentially towards the room temperature."
t_v1(τ) := t_1 + η·P/(m·c)·τ
t_v2(τ) := t_o + (t_2 - t_o)·exp(-τ/T)
"Heating:"
plot(t_v1(τ), τ: 0 min .. τ_o, hline: t_2, title: "Heating of the water in the tank", xlabel: "τ", ylabel: "t_v") | °C
"Cooling after switching off, drawn up to twice the time τ_c. The horizontal line is the limit temperature, the vertical line the time at which the curve crosses it:"
plot(t_v2(τ), τ: 0 h .. 2·τ_c, hline: t_c, vline: τ_c, title: "Cooling of the water after the heating is switched off", xlabel: "τ", ylabel: "t_v") | °C

## Checks
"The heat given off by the insulation during the cooling is the integral of the flow over time. It must equal the loss of heat of the water between t_2 and t_c:"
Φ_t(τ) := λ/δ·A·(t_v2(τ) - t_o)
Q_chl := integral(Φ_t(τ), τ: 0 h .. τ_c) | MJ
Q_uby := m·c·(t_2 - t_c) | MJ
check "The limit temperature lies between the room temperature and the temperature after heating": t_o < t_c and t_c < t_2
check "The heat from the element during the heating time equals the heat for heating": abs(η·P·τ_o - Q) ≤ 0.000001 MJ
check "During heating the temperature reaches t_2": abs(t_v1(τ_o) - t_2) ≤ 0.000001 K
check "The losses through the insulation are small against the power (within 5 %)": Φ_2/P ≤ 0.05
check "Heating with losses is only slightly longer (within 2 %)": (τ_oz - τ_o)/τ_o ≤ 0.02
check "By the exponential the water reaches t_c at the time τ_c": abs(t_v2(τ_c) - t_c) ≤ 0.000001 K
check "The heat given off by the insulation while cooling equals the loss of heat of the water": abs(Q_chl - Q_uby) ≤ 0.0001 MJ
check "Heating with losses reaches t_2 at the time τ_oz": abs(t_vz(τ_oz) - t_2) ≤ 0.000001 K
"The water heats from t_1 to t_2 in the time τ_o. The flow Φ_2 that the insulation lets through at the operating temperature is only a small part of the power of the element, so neglecting the losses during heating changes almost nothing, as the time τ_oz shows. Cooling is an order of magnitude slower than heating: the time constant T is given by the large heat capacity of the water and the small conductance of the insulation, so the water falls to the limit temperature t_c only after the time τ_c, which is a fraction of the time constant."
