# Čerpání vody do vodojemu: teorie {#T1}

Teorie k celému výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Proudění v potrubí a ztráty {#T2}

Průtok je součin průřezu potrubí a střední rychlosti. Podle Reynoldsova čísla se pozná, zda je proudění laminární, nebo turbulentní; v běžném vodovodním potrubí je turbulentní. Součinitel tření závisí na Reynoldsově čísle a na relativní drsnosti stěny, pro turbulentní proudění ho dobře popisuje explicitní vzorec Swameeho a Jaina (s Colebrookovou rovnicí se shoduje na jedno procento).

```kalk
relation Q == S·v
relation S == π·d^2/4
derive Q == π·d^2/4·v
relation Re == v·d/ν
relation λ == 0.25/log10(k/(3.7·d) + 5.74/Re^0.9)^2
```

Ztráta třením na délce L je úměrná rychlostní výšce, místní ztráta na tvarovce také. Obě se vyjadřují jako výška vodního sloupce.

```kalk
relation h_f == λ·L/d·v^2/(2·g)
relation h_l == ζ·v^2/(2·g)
relation h_z == h_f + h_l
relation h_z == K·Q^2
```

- Rychlost je v obou ztrátách ve druhé mocnině, proto se celková ztráta mění s druhou mocninou průtoku.
- Součinitel K spojuje ztrátu s průtokem a hodí se pro kreslení charakteristiky potrubí. Mírně závisí na λ, tedy na Reynoldsově čísle; v pracovní oblasti se ale mění o zlomky procenta.

Ověření na číslech: pro průtok 10 l/s v potrubí o světlosti 80 mm je rychlost asi 2 m/s a Reynoldsovo číslo kolem 145 000, tedy turbulentní proudění.

```kalk
Q_t := 10 L/s
d_t := 80 mm
ν_t := 1.1e-6 m^2/s
v_t := Q_t/(π·d_t^2/4) | m/s
Re_t := v_t·d_t/ν_t
check "rychlost kolem 2 m/s": abs(v_t - 2 m/s) ≤ 0.02 m/s
check "turbulentní": Re_t > 4000
```

## Čerpadlo a pracovní bod {#T3}

Čerpadlo musí dodat výšku, která překoná geodetický rozdíl hladin a hydraulické ztráty. Potrubí tak má charakteristiku, která začíná na geodetické výšce a s průtokem roste. Charakteristiku odstředivého čerpadla lze v pracovní oblasti popsat klesající parabolou. Pracovní bod je průsečík obou křivek.

```kalk
relation H_g == h_s + h_v + h_max
relation H_p(Q) == H_0 - a·Q^2
relation H_t(Q) == H_g + K·Q^2
relation H_0 - a·Q_b^2 == H_g + K·Q_b^2
derive Q_b == sqrt((H_0 - H_g)/(a + K))
```

Rovnost obou výšek dává pro průtok v pracovním bodě vzorec Q_b = √((H_0 − H_g)/(a + K)). Dosazením do kterékoli charakteristiky se získá dopravní výška H_b. Koeficient a se určí ze druhého katalogového bodu (Q_1, H_1): a = (H_0 − H_1)/Q_1².

```kalk
relation a == (H_0 - H_1)/Q_1^2
```

Pracovní bod má ležet v katalogovém rozsahu čerpadla; mimo něj parabola přestává platit.

## Výkon, energie a cena {#T4}

Voda dostane od čerpadla hydraulický výkon, který je součin tíhy dopravené za sekundu a dopravní výšky. Na hřídeli je třeba větší výkon, protože čerpadlo má ztráty, a z elektrické sítě ještě větší, protože ztráty má i motor.

```kalk
relation P_hyd == ρ·g·Q·H
relation P_h == P_hyd/η_č
relation P_el == P_h/η_m
relation E == P_el·t
```

Doba chodu čerpadla je objem dělený průtokem. Dosazením se průtok vykrátí a energie je práce proti tíži dělená celkovou účinností, nezávisle na průtoku. Cena energie je součin spotřeby a jednotkové ceny.

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

## Vodojem {#T5}

Nádrž s plochou průřezu S_n má mezi dvěma hladinami užitečný objem, který je součin plochy a rozdílu hladin. Hladina se mění podle rozdílu přítoku a odtoku. Pokud je přítok větší, hladina stoupá, jinak klesá.

```kalk
relation S_n == π·D^2/4
relation V_u == S_n·(h_max - h_min)
relation t_n == V_u/(Q_in - q_out)
relation w == q_out/S_n
```

- Rychlost změny hladiny w je odtok dělený plochou nádrže.
- Počet plnění za den je denní spotřeba dělená užitečným objemem nádrže, zaokrouhlený nahoru.
