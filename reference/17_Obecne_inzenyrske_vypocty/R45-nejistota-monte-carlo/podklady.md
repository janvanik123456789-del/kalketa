# Šíření nejistoty a metoda Monte Carlo

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Lineární šíření (GUM)

Když je výsledek funkcí vstupů, y = f(x_1, x_2, …), a nejistoty vstupů jsou malé, nahradí se funkce v okolí jmenovitého bodu tečnou rovinou. Nejistota výsledku je pak odmocnina ze součtu čtverců příspěvků c_i·u_i. Citlivosti c_i jsou parciální derivace. Postup je rychlý a stačí na většinu měření.

## Rovnoměrné rozdělení

Tolerance ±a bez dalších informací znamená rovnoměrné rozdělení. Jeho rozptyl je střední hodnota čtverce odchylky přes interval, a²/3:

```kalk
a := 2 Ω
u := a/sqrt(3)
v := integral((x - 52 Ω)^2, x: 50 Ω .. 54 Ω)/(2·a)
check "Rozptyl rovnoměrného rozdělení je a²/3": abs(u^2 - v) ≤ 1e-9 Ω^2
```

## Monte Carlo (doplněk 1 GUM)

Místo tečné roviny se vstupy mnohokrát vylosují ze svých rozdělení a pokaždé se spočte výsledek. Vznikne rozdělení výsledku, z něhož se přímo čte střední hodnota, směrodatná odchylka a interval pokrytí z kvantilů. Simulace nepotřebuje derivace a funguje i tam, kde je model silně nelineární nebo kde rozdělení výsledku není souměrné.

Přesnost roste s odmocninou počtu pokusů: střední hodnota se z 5 000 pokusů určí s chybou asi u/√5 000, tedy asi 1,4 % nejistoty. Generátor se semínkem dává pokaždé stejná čísla. Výpočet je proto opakovatelný a dá se zkontrolovat, i když je náhodný.

## Proč se tu tři postupy shodují

Výkon U²/R je zakřivený, ale v rozsahu ±1,3 % napětí a ±3,8 % odporu se od tečné roviny skoro neliší. Rozdíl mezi střední hodnotou a hodnotou v jmenovitém bodě způsobuje zakřivení a je tu menší než jeden watt. U větších nejistot, třeba u odporu s tolerancí ±50 %, by se lineární odhad a simulace rozešly viditelně. Simulace by pak dala nesouměrný interval.
