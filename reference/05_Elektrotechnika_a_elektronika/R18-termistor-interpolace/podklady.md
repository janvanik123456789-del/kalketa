# Interpolace tabulkových hodnot

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje jako odvození.

## Interpolace a aproximace

- **Interpolace** vede křivku přesně všemi body. Hodí se pro tabulky, kterým věříme: katalogové hodnoty, normové tabulky, výsledky přesného výpočtu.
- **Aproximace** (proložení metodou nejmenších čtverců, funkce `fit` a `polyfit` s nižším stupněm) body jen vystihuje. Hodí se pro naměřená data zatížená chybou, kde by křivka všemi body sledovala i šum měření.

## Lomená čára

Mezi sousedními body x₁, x₂ nahradíme křivku přímkou. Zápis po úsecích je totéž co Lagrangeův polynom dvou bodů:

```kalk
derive y_1 + (y_2 - y_1)·(x - x_1)/(x_2 - x_1) == y_1·(x - x_2)/(x_1 - x_2) + y_2·(x - x_1)/(x_2 - x_1)
```

Chyba je mezi body nejvýš (x − x₁)·(x₂ − x)/2 · max|f″|: roste se čtvercem kroku tabulky a se zakřivením funkce. U vypuklé křivky (NTC) leží lomená čára vždy nad ní. Při 37 °C v tabulce po 10 °C je největší zakřivení úseku 30–40 °C na jeho začátku, f″ ≐ 0,0171 kΩ/K², a odhad dává nejvýš 7·3/2·0,0171 ≐ 0,18 kΩ; skutečná chyba je 0,132 kΩ, asi 2,2 %.

## Kubický spline

Na každém úseku je kubika; sousední kubiky mají v uzlu stejnou hodnotu, první i druhou derivaci. Na koncích chybějí dvě podmínky. MATLAB, SciPy i Kalketa volí „not-a-knot“: první dvě a poslední dvě kubiky jsou jedna a tatáž křivka (spojitá je i třetí derivace ve druhém a předposledním bodě). Čtyři body kubiky proto dají přesně tu kubiku, tři body parabolu.

Spline je hladký a přesný pro hladké funkce, ale u dat se skokem nebo s prudkou změnou sklonu se může mezi body zhoupnout nad nebo pod data.

## PCHIP: kubika zachovávající tvar

PCHIP (po částech kubická Hermitova interpolace) volí v každém bodě sklon tak, aby křivka nepřekmitla: kde data mění směr, je sklon nulový, jinde vážený harmonický průměr sklonů sousedních úseků. Monotónní data dají monotónní křivku. Druhá derivace ale spojitá není, takže pro hladké funkce bývá o něco méně přesná než spline. Hodí se pro charakteristiky, kde by překmit byl nefyzikální (účinnost nad 100 %, záporný průtok).

## Polynom všemi body a Rungeho jev

Jedním polynomem stupně n − 1 lze projít n body (Lagrangeův polynom, `polyfit(x, y, n − 1)`). U hladké funkce, jako je exponenciála termistoru, bývá velmi přesný. U funkcí s prudkou změnou nebo u dat s chybou ale mezi krajními body silně kmitá (Rungeho jev) a s rostoucím počtem bodů se to zhoršuje. Proto se pro tabulky s mnoha body používají spliny, ne jeden polynom.

## Model B termistoru

Odpor polovodičového termistoru NTC klesá s teplotou exponenciálně. T je termodynamická teplota v kelvinech:

```kalk
relation R == R_25·exp(B·(1/T - 1/T_25))
derive ln(R/R_25) == B·(1/T - 1/T_25)
```

ln R je tedy přímka v 1/T. Ze dvou bodů tabulky se konstanta B spočte přímo; katalogy ji uvádějí jako B₂₅/₈₅ nebo B₀/₁₀₀ podle toho, ze kterých teplot:

```kalk
relation R_1 == R_25·exp(B·(1/T_1 - 1/T_25))
relation R_2 == R_25·exp(B·(1/T_2 - 1/T_25))
derive B == ln(R_1/R_2)/(1/T_1 - 1/T_2)
```

Citlivost termistoru (sklon charakteristiky) plyne z derivace modelu; relativně je to −B/T², kolem 25 °C asi −4,4 % na kelvin:

```kalk
derive derivative(R_25·exp(B·(1/T - 1/T_25)), T: T) == -B/T^2·R_25·exp(B·(1/T - 1/T_25))
```

Model B platí přesně jen v okolí teplot, ze kterých je B určeno. Přesnější je rovnice Steinhartova–Hartova: 1/T = a + b·ln R + c·(ln R)³.

## Kdy co použít

- Funkce známá vzorcem (model B): počítat vzorcem, tabulka je jen pro kontrolu.
- Hladká tabulka (vlastnosti látek, katalog): kubický spline.
- Tabulka, kde by překmit nedával smysl (monotónní charakteristika, data se zlomy): pchip.
- Hrubý odhad, hustá tabulka, nebo když to předepisuje norma: lomená čára.
- Naměřená data s chybou: aproximace (`fit`, `polyfit` nízkého stupně), ne interpolace.

## Ověření v Pythonu

Lomená čára a model B spočtené nezávisle na Kalketě (spline a pchip ověřuje test jádra proti SciPy).

```python
from math import exp, log

T = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
R = [33.62, 20.17, 12.54, 8.037, 5.301, 3.588, 2.486, 1.76, 1.27, 0.9336, 0.6975]
T_1 = 37.0

i = max(k for k in range(len(T) - 1) if T[k] <= T_1)
R_lin = R[i] + (R[i + 1] - R[i]) * (T_1 - T[i]) / (T[i + 1] - T[i])

K = lambda t: t + 273.15
B_0100 = log(R[0] / R[-1]) / (1 / K(T[0]) - 1 / K(T[-1]))
R_B = R[0] * exp(B_0100 * (1 / K(T_1) - 1 / K(T[0])))
R_1 = 10 * exp(3950 * (1 / K(T_1) - 1 / K(25)))

result("R_lin", R_lin, "kΩ")
result("B_0100", B_0100, "K")
result("R_B", R_B, "kΩ")
result("R_1", R_1, "kΩ")
result("δ_1", (R_lin / R_1 - 1) * 100, "%")
```
