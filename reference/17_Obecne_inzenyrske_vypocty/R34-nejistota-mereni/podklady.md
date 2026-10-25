# Nejistota měření

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

![Torzní kyvadlo](images/kyvadlo.svg)

## Standardní nejistota

Výsledek měření se udává s nejistotou: intervalem, ve kterém skutečná hodnota leží s danou pravděpodobností. Standardní nejistota je směrodatná odchylka tohoto rozdělení (GUM, Guide to the Expression of Uncertainty in Measurement).

**Typ A** se určí statisticky z opakovaných měření. Je to směrodatná odchylka průměru, s/√n:

```kalk
x := [10.1, 10.3, 9.9, 10.2, 10.0] mm
u_A := stdev(x)/sqrt(len(x)) | mm
check "směrodatná odchylka průměru": abs(u_A - 0.0707 mm) ≤ 0.0001 mm
```

**Typ B** se určí jinak: z rozlišení přístroje, třídy přesnosti, kalibračního listu. Je-li známa jen mez chyby Δ a každá hodnota v ní stejně pravděpodobná (rovnoměrné rozdělení), je u_B = Δ/√3.

**Kombinovaná nejistota** obou typů je odmocnina ze součtu čtverců. **Rozšířená nejistota** U = k·u s koeficientem k = 2 pokrývá asi 95 % hodnot.

## Šíření nejistoty

Je-li výsledek funkcí měřených veličin, nejistoty se šíří přes derivace (zákon šíření nejistot). Pro součin mocnin y = c·x₁^a·x₂^b se sčítají relativní nejistoty vynásobené exponenty, kvadraticky:

```kalk
relation (u_y/y)^2 == (a·u_1/x_1)^2 + (b·u_2/x_2)^2
```

Plocha kruhu S = π·d²/4 má proto relativní nejistotu dvojnásobnou proti průměru.
