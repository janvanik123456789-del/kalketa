# Kmitání soustav s více stupni volnosti

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje jako odvození.

![Dvě hmoty mezi stěnami spojené třemi pružinami](images/hmoty.svg)

## Pohybové rovnice

Výchylky y₁ a y₂ měříme od rovnovážné polohy. Pružina mezi dvěma body působí silou úměrnou rozdílu jejich výchylek. Na první hmotu působí pružina k₁ (stěna) a k₂ (druhá hmota), na druhou k₂ a k₃:

```kalk
relation m_1·a_1 == -k_1·y_1 - k_2·(y_1 - y_2)
relation m_2·a_2 == -k_2·(y_2 - y_1) - k_3·y_2
derive a_1 == (k_2·y_2 - (k_1 + k_2)·y_1)/m_1
```

V maticovém tvaru M·ÿ + K·y = 0 s maticí hmotnosti M = diag(m₁, m₂) a maticí tuhosti

K = [k₁ + k₂, −k₂ | −k₂, k₂ + k₃].

Matice tuhosti je souměrná: síla, kterou pružina k₂ tlačí první hmotu, je stejná jako ta, kterou tlačí druhou.

## Vlastní frekvence

Hledáme pohyb, při kterém kmitají obě hmoty stejnou frekvencí: y = φ·cos(ω·t). Dosazením (ÿ = −ω²·y) vznikne (K − ω²·M)·φ = 0. Nenulové φ existuje, jen když je determinant nulový; pro dvě hmoty je to kvadratická rovnice pro Ω = ω²:

```kalk
relation (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0
```

Pro zadané hodnoty má rovnice pěkné kořeny, které jde ověřit dosazením:

```kalk
m_1 := 9 kg
m_2 := 1 kg
k_1 := 38 N/m
k_2 := 2 N/m
k_3 := 3 N/m
Ω_a := 4 s^-2
Ω_b := 49 s^-2/9
check "Ω = 4 s⁻² je kořen": abs((k_1 + k_2 - m_1·Ω_a)·(k_2 + k_3 - m_2·Ω_a) - k_2^2) ≤ 1e-9 N^2/m^2
check "Ω = 49/9 s⁻² je kořen": abs((k_1 + k_2 - m_1·Ω_b)·(k_2 + k_3 - m_2·Ω_b) - k_2^2) ≤ 1e-9 N^2/m^2
```

Vlastní úhlové frekvence jsou tedy ω₁ = 2 rad/s a ω₂ = 7/3 rad/s. Pro větší soustavy se rovnice neřeší rukou: je to zobecněná úloha vlastních čísel K·φ = Ω·M·φ (v Kalketě `eigenvals(K, M)` a `eigenvecs(K, M)`).

## Tvary kmitů

Ke každé vlastní frekvenci patří tvar kmitu: poměr amplitud obou hmot. Z prvního řádku (K − Ω·M)·φ = 0 plyne:

```kalk
relation (k_1 + k_2 - m_1·Ω)·φ_1 - k_2·φ_2 == 0
derive φ_2/φ_1 == (k_1 + k_2 - m_1·Ω)/k_2
```

- Ω = 4 s⁻²: φ₂/φ₁ = (40 − 36)/2 = 2. Hmoty se pohybují stejným směrem, lehčí druhá dvojnásobně.
- Ω = 49/9 s⁻²: φ₂/φ₁ = (40 − 49)/2 = −4,5. Hmoty se pohybují proti sobě.

Vyšší tvar má víc změn směru; to platí obecně pro soustavy s více stupni volnosti.

## Volné kmitání: součet tvarů

Obecný pohyb bez buzení je součtem tvarů kmitů, každý se svou frekvencí. Bez počáteční rychlosti:

y(t) = C₁·φ₁·cos(ω₁·t) + C₂·φ₂·cos(ω₂·t)

Amplitudy C₁, C₂ plynou z počátečních výchylek: Φ·C = y(0), kde Φ má tvary jako sloupce. Pro y(0) = [1, 0] s tvary [1, 2] a [1, −4,5]:

```kalk
Φ := [1, 1 | 2, -4.5]
C := lsolve(Φ, [1, 0])
check "C₁ = 9/13": abs(C[1] - 9/13) ≤ 1e-12
check "C₂ = 4/13": abs(C[2] - 4/13) ≤ 1e-12
```

## Rázy

Jsou-li vlastní frekvence blízko sebe, součet dvou kosinů se chová jako kmit střední frekvence s pomalu se měnící amplitudou. Energie se přelévá z jedné hmoty na druhou a zpět; perioda obálky (rázů) je

```kalk
relation T_r == 2·π/(ω_2 - ω_1)
```

pro zadanou soustavu 2π/(1/3) ≐ 18,85 s. Druhá hmota v první chvíli stojí, rozkmitá se přes pružinu k₂ a po polovině periody rázů kmitá ona, zatímco první se téměř zastaví.

## Předpoklady výpočtu

- Hmoty jsou tuhé a pohybují se jen po přímce, bez tření a tlumení.
- Pružiny jsou lineární a nehmotné.
- Zdroj neuvádí jednotky; výpočet bere kg, N/m a m.
