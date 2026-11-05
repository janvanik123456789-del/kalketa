# Vyčíslení chemické rovnice

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Rovnice jako soustava

Při reakci atomy nevznikají ani nezanikají. Pro každý prvek proto platí, že počet jeho atomů vlevo se rovná počtu vpravo. Koeficienty rovnice jsou neznámé a každý prvek dá jednu lineární rovnici. Když se produkty zapíšou se záporným znaménkem, mají všechny rovnice nulovou pravou stranu: hledá se vektor, který matice prvků zobrazí na nulu, tedy její **nulový prostor**.

Rovnice určuje jen poměr koeficientů. Kdo všechno vynásobí dvěma, dostane stejnou reakci. Proto se z nulového prostoru berou nejmenší celá čísla.

## Jednoduchý příklad

Hoření propanu C₃H₈ + O₂ → CO₂ + H₂O má prvky C, H, O a čtyři látky:

```kalk
A := [3, 0, -1, 0 | 8, 0, 0, -2 | 0, 2, -2, -1]
c := whole(nullspace(A))
check "C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O": c[1] == 1 and c[2] == 5 and c[3] == 3 and c[4] == 4
```

## Kdy to nejde tak snadno

- **Hodnost menší o víc než jedna:** rovnice má víc nezávislých vyčíslení, protože ve skutečnosti probíhá víc reakcí naráz. Nulový prostor pak má víc sloupců a chemie musí rozhodnout, v jakém poměru reakce probíhají.
- **Hodnost rovná počtu látek:** jediným řešením jsou nuly, takže rovnice nejde vyčíslit. Obvykle chybí nějaká látka, například voda.
- **Redoxní reakce** jako tato jdou vyčíslit i přes výměnu elektronů: mangan přijme 5 elektronů, chlor jeden odevzdá. Matice to zvládne bez znalosti oxidačních čísel. Kontrola oxidačních čísel je ale dobrý způsob, jak výsledek ověřit.

## Stechiometrie

Látková množství jsou v poměru koeficientů. Z hmotnosti jedné látky se tedy dopočítají množství všech ostatních a jejich hmotnosti. Bilance hmotnosti je nezávislá kontrola: součet molárních hmotností násobených koeficienty musí vyjít na obou stranách stejně.
