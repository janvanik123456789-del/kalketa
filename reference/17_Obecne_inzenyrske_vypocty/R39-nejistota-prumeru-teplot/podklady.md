# Nejistota průměru z opakovaných měření

Teorie k výpočtu, vlastními slovy. Kalketa ověřuje vzorce v rámečcích.

## Průměr a jeho standardní nejistota

Kolísají-li odečty kolem neznámé hodnoty nezávisle a normálně, je nejlepším odhadem měřené veličiny aritmetický průměr. Jeho standardní nejistota je směrodatná odchylka průměru, tedy výběrová směrodatná odchylka s dělená odmocninou z počtu měření m (nejistota typu A podle GUM):

```kalk
x := [10.1, 10.3, 9.9, 10.2, 10.0] mm
u_x := stdev(x)/sqrt(len(x)) | mm
check "směrodatná odchylka průměru": abs(u_x - 0.0707 mm) ≤ 0.0001 mm
```

## Rozšířená nejistota a Studentovo rozdělení

Protože s je jen odhad z malého počtu měření, nepoužije se k = 2 z normálního rozdělení, ale kvantil Studentova rozdělení t pro ν = m − 1 stupňů volnosti. Pro 95% pokrytí je to kvantil na hladině 0,975 (oboustranný interval, v každém chvostu 2,5 %). Pro ν = 21 vychází k = 2,080, o něco více než 2; s rostoucím ν se blíží 1,96:

```kalk
check "k pro ν = 21": abs(tinv(0.975, 21) - 2.0796) ≤ 0.0001
check "k pro velké ν": abs(tinv(0.975, 100000) - norminv(0.975)) ≤ 0.001
```

Rozšířená nejistota je U = k·u a interval pokrytí průměru je t̄ − U až t̄ + U.

## Jednotky teploty

Průměr teplot ve °C je teplota, směrodatná odchylka a nejistota jsou rozdíly teplot v K. Proto je interval t̄ ± U opět ve °C.
