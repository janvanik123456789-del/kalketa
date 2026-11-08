# Ohřev a chladnutí vody v zásobníku

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Teplo na ohřev

Má-li se voda o hmotnosti m ohřát o rozdíl teplot Δt, musí přijmout teplo úměrné měrné tepelné kapacitě c, tedy Q = m·c·Δt. Hmotnost vody je m = ρ·V. Topné těleso s příkonem P dodá za čas τ jen teplo η·P·τ, protože účinnost η říká, že část příkonu se do vody nedostane. Z rovnosti obou tepel vyjde doba ohřevu. Ztráty izolací, které při ohřevu také působí, jsou proti příkonu tělesa malé, a proto je v prvním přiblížení zanedbáváme.

```kalk
relation Q == m·c·Δt
relation η·P·τ == m·c·Δt
```

## Vedení tepla rovinnou vrstvou

Tenkou vrstvou izolace vede teplo úměrně rozdílu teplot na jejích stranách a nepřímo úměrně tloušťce. Součinitel λ je tepelná vodivost materiálu. U tenké vrstvy na velké nádobě lze stěnu počítat jako rovinnou. Podíl λ/δ je tepelná propustnost vrstvy ve W/(m²·K), její převrácená hodnota δ/λ je tepelný odpor na jednotku plochy. Ocelová stěna vede teplo velmi dobře, takže její odpor je proti izolaci zanedbatelný.

```kalk
relation Φ == λ/δ·A·(t_v - t_o)
```

## Chladnutí vody

Bez ohřevu ubývá vodě teplo právě tepelným tokem izolací, m·c·dt_v = −Φ·dτ. Protože tok je úměrný rozdílu t_v − t_o, dá se rovnice psát jako d(t_v − t_o)/(t_v − t_o) = −dτ/T. Integrace dá exponenciální pokles rozdílu teplot. Časová konstanta T je doba, za kterou rozdíl klesne na 1/e (asi 37 %) původní hodnoty. Je to poměr tepelné kapacity vody a vodivosti pláště.

```kalk
relation m·c·dt_v == -λ/δ·A·(t_v - t_o)·dτ
relation T == m·c·δ/(λ·A)
relation t_v - t_o == (t_2 - t_o)·exp(-τ/T)
```

Doba, za kterou teplota klesne z t_2 na t, je τ = T·ln((t_2 − t_o)/(t − t_o)). Voda se teplotě místnosti jen přibližuje a nikdy ji nedosáhne, proto mezní teplota musí ležet nad t_o. Následující ukázka ověří, že po jedné časové konstantě zbývá 1/e rozdílu teplot a že vzorec pro čas dá při dosazení zpět zadanou teplotu:

```kalk
t_o := 20 °C
t_2 := 60 °C
T := 116.2778 h
f(τ) := t_o + (t_2 - t_o)·exp(-τ/T)
t_c := 50 °C
τ_c := T·ln((t_2 - t_o)/(t_c - t_o))
check "Po jedné časové konstantě zbývá 1/e rozdílu teplot": abs((f(T) - t_o)/(t_2 - t_o) - exp(-1)) ≤ 0.000001
check "Vzorec pro čas dá zpět mezní teplotu": abs(f(τ_c) - t_c) ≤ 0.000001 K
```

## Ohřev se ztrátami

Při ohřevu se k teplu z tělesa přidá tok izolací, m·c·dt_v/dτ = η·P − G·(t_v − t_o), kde G = λ·A/δ. Řešení má tvar chladnutí, jen se teplota blíží k rovnovážné hodnotě t_o + η·P/G. Ta je u zásobníku mnohonásobně vyšší než provozní teplota, a proto je ohřev téměř přímočarý a ztráty doby ohřevu skoro neprodlouží.
