# Proložení polynomem 2. stupně na zašuměných datech

"Deset změřených bodů s šumem; polynom druhého stupně metodou nejmenších čtverců."
table Sum:
    | x | y |
    | 0 | 2.1 |
    | 1 | 3.9 |
    | 2 | 6.2 |
    | 3 | 8.1 |
    | 4 | 10.2 |
    | 5 | 11.9 |
    | 6 | 14.3 |
    | 7 | 15.8 |
    | 8 | 18.2 |
    | 9 | 19.9 |
p := polyfit(Sum.x, Sum.y, 2)
"Koeficienty se čtou od nejvyšší mocniny."
a2 := p[1]
a1 := p[2]
a0 := p[3]
"Normální rovnice nejmenších čtverců: součty vážených reziduí musí být nulové."
rez := Sum.y - (a0 + a1·Sum.x + a2·Sum.x²)
check "Nulové reziduum": abs(sum(rez)) < 1e-9
check "Nulové reziduum vážené x": abs(sum(rez·Sum.x)) < 1e-9
check "Nulové reziduum vážené x²": abs(sum(rez·Sum.x²)) < 1e-9
"Hodnota křivky v pěti a určovací koeficient."
p5 := p(5)
R2 := fit_r2(p)
check "R² je vysoké": R2 > 0.99
