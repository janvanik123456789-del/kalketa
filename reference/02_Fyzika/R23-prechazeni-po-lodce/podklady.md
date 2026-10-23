# Těžiště soustavy a vnitřní síly

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje jako odvození.

![Člověk přejde ze zádi na příď, těžiště T zůstane na místě a loďka se posune o x](images/lodka.svg)

## Těžiště soustavy hmotných bodů

Poloha těžiště je průměr poloh vážený hmotnostmi. Pro dvě tělesa, každé nahrazené bodem v jeho těžišti:

```kalk
relation x_T == (m_1·x_1 + m_2·x_2)/(m_1 + m_2)
```

Pro více těles se v čitateli i ve jmenovateli sčítá přes všechna.

## Kdy se těžiště nepohne

Těžiště soustavy se pohybuje tak, jako by v něm byla soustředěná celá hmotnost a působila na ni výslednice **vnějších** sil. Vnitřní síly (tření bot o dno loďky, síla nohou, napětí v laně mezi dvěma tělesy) se párují podle zákona akce a reakce a jejich součet je nulový; těžiště nemohou rozpohybovat.

Je-li výslednice vnějších sil nulová a těžiště na začátku v klidu, zůstane v klidu. Posunou-li se tělesa o Δx₁ a Δx₂, musí platit:

```kalk
relation (m_1·x_1 + m_2·x_2)/(m_1 + m_2) == (m_1·(x_1 + Δx_1) + m_2·(x_2 + Δx_2))/(m_1 + m_2)
derive Δx_2 == -m_1·Δx_1/m_2
```

Posunutí jsou opačná a v obráceném poměru hmotností: těžší těleso se posune méně.

## Loďka a člověk

Člověk se vůči loďce posune o celou její délku směrem k přídi, vůči vodě ale jen o L − x, protože loďka mezitím odjede o x na druhou stranu. Podmínka nepohyblivého těžiště:

```kalk
relation m_c·(x - L_l) + M·x == 0
derive x == m_c·L_l/(M + m_c)
```

Výsledek nezávisí na tom, jak rychle člověk jde ani jestli se cestou zastaví: rozhoduje jen to, kde skončí. Dosazením zadaných hodnot:

```kalk
m_c := 70 kg
M := 100 kg
L_l := 2.5 m
x := m_c·L_l/(M + m_c)
check "Posun loďky je asi 1,03 m": abs(x - 1.0294 m) ≤ 0.0001 m
```

## Předpoklady výpočtu

- **Odpor vody zanedbáváme.** Kdyby se počítal, byl by to vnější síla; dokud se loďka pohybuje, brzdí ji a posun vyjde menší.
- **Naklonění loďky zanedbáváme.** Člověk na zádi loďku naklání, těžiště se tím posouvá i svisle; na vodorovný posun to má malý vliv.
- Loďka i člověk jsou nahrazeni body v jejich těžištích. Člověk stojí na zádi a na přídi přímo nad koncem loďky; ve skutečnosti stojí kousek uvnitř a ujde o něco méně než L.

## Ověření v Pythonu

Jiná cesta k témuž výsledku: člověk jde s proměnnou rychlostí vůči loďce (rozběhne se, zpomalí, chvíli stojí), a z rovnosti hybností se krok po kroku počítá rychlost loďky. Posun loďky na konci musí vyjít stejně jako ze vzorce, bez ohledu na průběh chůze.

```python
from math import sin, pi

m_c, M, L = 70.0, 100.0, 2.5

# The man's speed relative to the boat (towards the bow, negative x): a profile with a stop in the middle,
# scaled so that he walks exactly the length of the boat.
T, n = 6.0, 60000
dt = T / n
def shape(t):
    return sin(pi * t / T) ** 2 * (0.2 if 2.5 < t < 3.5 else 1.0)
total = sum(shape((i + 0.5) * dt) for i in range(n)) * dt
x_boat, x_man_rel = 0.0, 0.0
for i in range(n):
    u = -L / total * shape((i + 0.5) * dt)      # speed of the man relative to the boat
    # Momentum stays zero: M·v + m_c·(v + u) = 0
    v = -m_c * u / (M + m_c)
    x_boat += v * dt
    x_man_rel += u * dt
print("the man walked", round(-x_man_rel, 6), "m on the boat; the boat moved", round(x_boat, 6), "m")

x = m_c * L / (M + m_c)
result("x", x_boat, "m", rel=1e-6)
result("x_T1", (M * L / 2 + m_c * L) / (M + m_c), "m")
result("s_c", L - x_boat, "m", rel=1e-6)
```
