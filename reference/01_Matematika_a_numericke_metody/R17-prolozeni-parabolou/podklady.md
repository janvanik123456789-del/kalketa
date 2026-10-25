# Metoda nejmenších čtverců

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje jako odvození.

## Úloha

Naměřené body [xᵢ; yᵢ] nikdy neleží přesně na křivce: měření má chyby. Hledáme křivku daného tvaru, která body vystihuje nejlépe. U polynomu 2. stupně y = b₀ + b₁·x + b₂·x² jde o tři koeficienty. Jako míru shody bereme součet čtverců svislých odchylek bodů od křivky:

S = Σ (yᵢ − b₀ − b₁·xᵢ − b₂·xᵢ²)²

Čtverce proto, že odchylky nahoru i dolů se nevyruší a velké odchylky váží víc než malé. Hledáme koeficienty, pro které je S nejmenší.

## Normální rovnice

V minimu jsou derivace S podle všech koeficientů nulové. Derivace jednoho členu součtu podle b₀, b₁ a b₂:

```kalk
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_0: b_0) == -2·(y - b_0 - b_1·x - b_2·x^2)
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_1: b_1) == -2·x·(y - b_0 - b_1·x - b_2·x^2)
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_2: b_2) == -2·x^2·(y - b_0 - b_1·x - b_2·x^2)
```

Sečteme přes všechny body, položíme rovno nule a vydělíme −2. Vzniknou tři lineární rovnice pro b₀, b₁, b₂, normální rovnice:

- n·b₀ + Σx·b₁ + Σx²·b₂ = Σy
- Σx·b₀ + Σx²·b₁ + Σx³·b₂ = Σx·y
- Σx²·b₀ + Σx³·b₁ + Σx⁴·b₂ = Σx²·y

Koeficienty soustavy jsou součty mocnin x přes body (n je počet bodů), pravé strany součty x^k·y. Soustava je symetrická a pro body s alespoň třemi různými x má jediné řešení. Funkce `fit(…, kind: "poly2", steps: true)` ji vypíše i s čísly.

## Přímka jako zvláštní případ

Pro přímku (b₂ = 0) zbudou dvě normální rovnice. Jejich řešením jsou známé vzorce pro směrnici a úsek:

```kalk
relation n·b_0 + S_x·b_1 == S_y
relation S_x·b_0 + S_xx·b_1 == S_xy
derive b_1 == (n·S_xy - S_x·S_y)/(n·S_xx - S_x^2)
derive b_0 == (S_y - b_1·S_x)/n
```

Zde S_x = Σx, S_xx = Σx², S_y = Σy a S_xy = Σx·y.

## Koeficient determinace R²

R² = 1 − S / Σ(yᵢ − ȳ)² porovnává zbylé odchylky s rozptylem samotných y kolem jejich průměru ȳ. R² = 1 znamená, že body leží přesně na křivce. Polynom vyššího stupně má vždy R² aspoň takové jako nižší (přímka je parabola s b₂ = 0), lepší R² proto samo neříká, že tvar křivky je správný. Stupeň se volí podle fyzikální povahy závislosti a podle toho, zda odchylky bodů od křivky vypadají náhodně.

## Na co si dát pozor

- **Počet bodů.** Polynom stupně k má k + 1 koeficientů; bodů musí být víc, jinak křivka projde všemi body přesně a o chybách měření nic neřekne.
- **Mimo měřený rozsah.** Mimo rozsah naměřených x polynom rychle uhýbá; předpověď za posledním bodem je jen odhad.
- **Zaokrouhlování.** Součty Σx⁴ rostou rychle a soustava bývá citlivá na zaokrouhlení. Při ručním výpočtu je třeba počítat s dostatkem platných číslic a výsledek ověřit dosazením do všech tří rovnic.
