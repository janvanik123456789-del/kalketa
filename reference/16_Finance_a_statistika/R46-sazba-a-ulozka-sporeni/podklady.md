# Spoření s čtvrtletním připisováním úroků

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Úložky v rámci čtvrtletí

Střadatel vkládá koncem každého měsíce, úroky se připisují koncem čtvrtletí. Úložka vložená koncem prvního měsíce se úročí dva měsíce, druhá jeden měsíc, třetí vůbec. Při jednoduchém úročení uvnitř čtvrtletí s roční sazbou i se tři měsíční úložky a rovnají jedné čtvrtletní úložce, vložené koncem čtvrtletí:

```kalk
a := 1000 Kč
i := 6 %
m := 3
X := a·(m + i/12·(m - 1)·m/2)
check "tři úložky za čtvrtletí s úrokem 2 + 1 měsíc": abs(X - a·(3 + i/12·3)) ≤ 0.001 Kč
```

## Čtvrtletní střadatel

Čtvrtletní úložky X s čtvrtletní sazbou j = i/4 po n čtvrtletích dají polhůtní střadatel s = ((1 + j)^n − 1)/j. Pro j = 1 % a n = 4 vychází 4,0604:

```kalk
j := 1 %
n := 4
s := ((1 + j)^n - 1)/j
check "střadatel pro 1 % a 4 období": abs(s - 4.060401) ≤ 0.00001
```

## Dvě neznámé z dvou stavů

Po pěti letech platí X·s = S₅. Po výběru V zůstane S₅ − V, které se dalších pět let jen úročí, a přibudou nové úložky se stejným střadatelem:

(S₅ − V)·(1 + j)^20 + X·s = S₁₀.

Dosazením první rovnice do druhé úložka vypadne a zbude jediná rovnice pro sazbu, kterou jde vyřešit zvlášť: (1 + j)^20 = (S₁₀ − S₅)/(S₅ − V).

```kalk
S_5 := 500000 Kč
V := 75000 Kč
S_10 := 1100000 Kč
j := ((S_10 - S_5)/(S_5 - V))^(1/20) - 1
check "čtvrtletní sazba z uzavřeného tvaru": abs(j - 1.73915 %) ≤ 0.0001 %
```
