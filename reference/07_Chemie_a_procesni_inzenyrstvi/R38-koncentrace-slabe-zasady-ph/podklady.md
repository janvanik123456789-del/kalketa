# Sůl slabé kyseliny jako slabá zásada

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Proč je roztok soli zásaditý

Sůl slabé kyseliny HB (octan, kyanid) se ve vodě rozpadne na ionty. Anion B⁻ je konjugovaná zásada a přijímá proton od vody:

B⁻ + H₂O ⇌ HB + OH⁻

Čím slabší je kyselina HB (čím menší je K_a), tím silnější zásadou anion je a tím vyšší je pH roztoku. Kyanovodík (K_a = 4,93·10⁻¹⁰ mol/dm³) je mnohem slabší kyselina než kyselina octová (1,76·10⁻⁵ mol/dm³), proto stejné pH vyžaduje mnohem menší koncentraci kyanidu než octanu.

## Zjednodušený vztah

Zanedbáme-li autoprotolýzu vody a předpokládáme-li, že anion zreagoval jen nepatrně, je [HB] = [OH⁻] a c(B) je téměř konstantní. Z rovnováh K_a = [H⁺]·[B⁻]/[HB] a K_w = [H⁺]·[OH⁻] vyjde [H⁺]² = K_a·K_w/c, a po zlogaritmování pH = ½·(pK_a + pK_w + log c). Odtud koncentrace pro zadané pH (v jednotkách mol/dm³):

```kalk
pH := 8.5
K_a := 4.93e-10
K_w := 1e-14
c := 10^(2·pH)·K_w/K_a
check "c vychází 4,93·10⁻⁷": abs(c - 4.93e-7) ≤ 1e-9
```

## Přesný vztah s autoprotolýzou vody

Je-li roztok velmi zředěný, nesmí se zanedbat ani oxoniové ionty, které dává voda. Náboj roztoku musí být nulový: [Na⁺] + [H⁺] = [B⁻] + [OH⁻]. Spolu s látkovou bilancí c = [HB] + [B⁻] a rovnováhou K_a to vede na kvadratickou rovnici pro [H⁺], z níž je koncentrace

```kalk
H := 10^(-8.5)
K_a := 4.93e-10
K_w := 1e-14
c := (K_w·H + K_a·K_w)/H^2
check "c vychází 3,655·10⁻⁶": abs(c - 3.6553e-6) ≤ 1e-9
```

Pro octan se obě koncentrace liší o 0,02 %, pro kyanid o 87 %: zjednodušení má u kyanidu smysl jen pro koncentrace vyšší než přibližně 10⁻⁵ mol/dm³.

## Zkouška

Dosadíme-li zjednodušenou koncentraci kyanidu zpět do kvadratické rovnice c·[H⁺]² − K_w·[H⁺] − K_a·K_w = 0, vyjde pH = 7,68, nikoli 8,5. Zjednodušený vztah by tedy pro kyanid zadané pH nezaručil.
