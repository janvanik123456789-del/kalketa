# Pumping water into a water tower: theory {#T1}

The theory behind the whole calculation, in our own words. Kalketa checks the formulas in the boxes.

## Flow in a pipe and losses {#T2}

The flow rate is the product of the pipe cross-section and the mean velocity. The Reynolds number tells whether the flow is laminar or turbulent; in an ordinary water pipe it is turbulent. The friction factor depends on the Reynolds number and on the relative roughness of the wall; for turbulent flow it is well described by the explicit formula of Swamee and Jain (it agrees with the Colebrook equation within one percent).

```kalk
relation Q == S·v
relation S == π·d^2/4
derive Q == π·d^2/4·v
relation Re == v·d/ν
relation λ == 0.25/log10(k/(3.7·d) + 5.74/Re^0.9)^2
```

The friction loss over the length L is proportional to the velocity head, and so is a local loss at a fitting. Both are expressed as a height of a water column.

```kalk
relation h_f == λ·L/d·v^2/(2·g)
relation h_l == ζ·v^2/(2·g)
relation h_z == h_f + h_l
relation h_z == K·Q^2
```

- The velocity enters both losses squared, so the total loss changes with the square of the flow rate.
- The coefficient K links the loss with the flow rate and is handy for drawing the characteristic of the pipe. It depends slightly on λ, hence on the Reynolds number; in the working range it changes by fractions of a percent.

A check with numbers: for a flow rate of 10 l/s in a pipe of 80 mm bore the velocity is about 2 m/s and the Reynolds number around 145 000, so the flow is turbulent.

```kalk
Q_t := 10 L/s
d_t := 80 mm
ν_t := 1.1e-6 m^2/s
v_t := Q_t/(π·d_t^2/4) | m/s
Re_t := v_t·d_t/ν_t
check "velocity about 2 m/s": abs(v_t - 2 m/s) ≤ 0.02 m/s
check "turbulent": Re_t > 4000
```

## Pump and operating point {#T3}

The pump must supply a head that overcomes the difference in height of the water levels and the hydraulic losses. The pipe thus has a characteristic that starts at the static head and grows with the flow rate. The characteristic of a centrifugal pump can be described in the working range by a falling parabola. The operating point is the intersection of the two curves.

```kalk
relation H_g == h_s + h_v + h_max
relation H_p(Q) == H_0 - a·Q^2
relation H_t(Q) == H_g + K·Q^2
relation H_0 - a·Q_b^2 == H_g + K·Q_b^2
derive Q_b == sqrt((H_0 - H_g)/(a + K))
```

Equating the two heads gives the flow rate at the operating point, Q_b = √((H_0 − H_g)/(a + K)). Substituting into either characteristic gives the head H_b. The coefficient a is found from the second catalogue point (Q_1, H_1): a = (H_0 − H_1)/Q_1².

```kalk
relation a == (H_0 - H_1)/Q_1^2
```

The operating point should lie within the catalogue range of the pump; outside it the parabola stops being valid.

## Power, energy and cost {#T4}

The pump gives the water a hydraulic power, which is the product of the weight delivered per second and the head. A larger power is needed on the shaft because the pump has losses, and a still larger one from the mains because the motor has losses too.

```kalk
relation P_hyd == ρ·g·Q·H
relation P_h == P_hyd/η_č
relation P_el == P_h/η_m
relation E == P_el·t
```

The running time of the pump is the volume divided by the flow rate. By substitution the flow rate cancels and the energy is the work against gravity divided by the overall efficiency, independent of the flow rate. The cost of energy is the consumption times the unit price.

```kalk
relation P_hyd == ρ·g·Q·H
relation P_h == P_hyd/η_č
relation P_el == P_h/η_m
relation E == P_el·t
relation t == V/Q
derive E == ρ·g·V·H/(η_č·η_m)
```

```kalk
relation N == E·c_e
```

## Water tower {#T5}

A tank with the cross-sectional area S_n has between two levels a useful volume, which is the product of the area and the difference of the levels. The level changes according to the difference of inflow and outflow. If the inflow is larger the level rises, otherwise it falls.

```kalk
relation S_n == π·D^2/4
relation V_u == S_n·(h_max - h_min)
relation t_n == V_u/(Q_in - q_out)
relation w == q_out/S_n
```

- The rate of change of the level w is the outflow divided by the area of the tank.
- The number of fillings per day is the daily consumption divided by the useful volume of the tank, rounded up.
