# Heating and cooling of water in a storage tank

The theory for the calculation, in our own words. Kalketa checks the formulas in the boxes.

## Heat for heating

To heat water of mass m by a temperature difference Δt, it must take up heat proportional to the specific heat capacity c, that is Q = m·c·Δt. The mass of the water is m = ρ·V. A heating element of input power P supplies only the heat η·P·τ in the time τ, because the efficiency η says that part of the input power does not reach the water. The heating time follows from the equality of the two heats. The losses through the insulation, which also act during heating, are small against the power of the element, so in the first approximation we neglect them.

```kalk
relation Q == m·c·Δt
relation η·P·τ == m·c·Δt
```

## Heat conduction through a plane layer

A thin layer of insulation conducts heat in proportion to the temperature difference across it and inversely to its thickness. The coefficient λ is the thermal conductivity of the material. A thin layer on a large vessel can be treated as a plane wall. The ratio λ/δ is the thermal transmittance of the layer in W/(m²·K); its reciprocal δ/λ is the thermal resistance per unit area. The steel wall conducts heat very well, so its resistance is negligible against the insulation.

```kalk
relation Φ == λ/δ·A·(t_v - t_o)
```

## Cooling of the water

Without heating the water loses heat exactly by the heat flow through the insulation, m·c·dt_v = −Φ·dτ. Since the flow is proportional to the difference t_v − t_o, the equation can be written as d(t_v − t_o)/(t_v − t_o) = −dτ/T. Integration gives an exponential decay of the temperature difference. The time constant T is the time in which the difference falls to 1/e (about 37 %) of its original value. It is the ratio of the heat capacity of the water to the conductance of the jacket.

```kalk
relation m·c·dt_v == -λ/δ·A·(t_v - t_o)·dτ
relation T == m·c·δ/(λ·A)
relation t_v - t_o == (t_2 - t_o)·exp(-τ/T)
```

The time in which the temperature falls from t_2 to t is τ = T·ln((t_2 − t_o)/(t − t_o)). The water only approaches the room temperature and never reaches it, so the limit temperature must lie above t_o. The following example checks that after one time constant 1/e of the temperature difference remains, and that the formula for the time gives the given temperature back when substituted:

```kalk
t_o := 20 °C
t_2 := 60 °C
T := 116.2778 h
f(τ) := t_o + (t_2 - t_o)·exp(-τ/T)
t_c := 50 °C
τ_c := T·ln((t_2 - t_o)/(t_c - t_o))
check "After one time constant 1/e of the temperature difference remains": abs((f(T) - t_o)/(t_2 - t_o) - exp(-1)) ≤ 0.000001
check "The formula for the time gives the limit temperature back": abs(f(τ_c) - t_c) ≤ 0.000001 K
```

## Heating with losses

During heating the flow through the insulation is added to the heat from the element, m·c·dt_v/dτ = η·P − G·(t_v − t_o), where G = λ·A/δ. The solution has the form of the cooling, only the temperature approaches the equilibrium value t_o + η·P/G. For a storage tank it is many times higher than the operating temperature, so the heating is almost linear and the losses hardly prolong the heating time.
