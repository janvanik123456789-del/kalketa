# Proložení naměřených bodů parabolou metodou nejmenších čtverců
"Pět bodů z experimentu má nelineární trend. Proložíme je polynomem 2. stupně (parabolou) y = b_0 + b_1·x + b_2·x² tak, aby součet čtverců odchylek bodů od křivky byl nejmenší, a porovnáme ji s přímkou. Teorie (odvození normálních rovnic) je ve vrstvě Podklady."

## Naměřené body
table Body: {across}
    | x {0} | y {0.0} |
    | 1     | 2.1     |
    | 2     | 3.9     |
    | 3     | 4.2     |
    | 4     | 6.2     |
    | 5     | 9.1     |

## Parabola
"Hledáme b_0, b_1, b_2, pro které je součet čtverců odchylek Σ(y − b_0 − b_1·x − b_2·x²)² nejmenší. Derivace podle každého koeficientu položené rovny nule dávají soustavu tří lineárních rovnic, normálních rovnic (viz Podklady). Program sečte mocniny x přes body, sestaví soustavu a vyřeší ji:"
P := fit(Body.y, x: Body.x, kind: "poly2", steps: true)

## Srovnání s přímkou
"Přímka nejmenších čtverců stejnými body:"
L := fit(Body.y, x: Body.x)
"Součet čtverců odchylek bodů od paraboly a od přímky:"
S_P := sum((Body.y - P(Body.x))^2)
S_L := sum((Body.y - L(Body.x))^2)
check "parabola sedí na body lépe než přímka": S_P < S_L
plot(Body.y, P(x), L(x), x: Body.x, title: "Naměřené body, parabola a přímka")
