# Vratná reakce

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Rychlostní rovnice

U reakce prvního řádu je rychlost přeměny úměrná koncentraci. Ve vratné reakci probíhají obě přeměny současně, a proto každá koncentrace závisí na té druhé:

a′ = −k_1·a + k_2·b, b′ = k_1·a − k_2·b

Pravé strany jsou opačné, takže součet a + b se nemění. To je zákon zachování látky a v listu ho hlídá posudek.

## Rovnováha

Rovnováha nastane, když se obě přeměny vyrovnají. Poměr koncentrací je pak rovnovážná konstanta K = k_1/k_2 a nezávisí na počátečním složení:

```kalk
k_1 := 0.002 1/s
k_2 := 0.001 1/s
a_0 := 1 mol/l
a_r := a_0·k_2/(k_1 + k_2)
b_r := a_0 - a_r
check "V rovnováze jsou obě přeměny stejně rychlé": abs(k_1·a_r - k_2·b_r) ≤ 1e-12 mol/(l·s)
```

## Přesné řešení

Dosazením b = a_0 + b_0 − a vznikne jediná rovnice pro a a její řešení je exponenciála:

a(t) = a_r + (a_0 − a_r)·exp(−(k_1 + k_2)·t)

Časová konstanta je 1/(k_1 + k_2). Na první pohled překvapí, že k rovnováze se reakce blíží tím rychleji, čím je **větší i zpětná konstanta**: zpětná reakce sice zmenší výtěžek, ale cíl je blíž a dosáhne se ho dřív. Čas potřebný na 90 % cesty je ln(10)/(k_1 + k_2).

## Kdy je potřeba soustava

Tady by stačila jedna rovnice díky zákonu zachování. Soustava je obecnější: přidá-li se další krok, například A ⇌ B → C, přesné řešení se rychle zkomplikuje, ale zápis v listu zůstane stejně jednoduchý. Stačí připsat křivku, rovnici a počáteční podmínku.
