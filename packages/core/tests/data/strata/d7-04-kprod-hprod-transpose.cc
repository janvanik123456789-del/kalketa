# Dávka 7 – list 04: kprod, hprod a transpose s jednotkami; rozměrová kontrola
Fv := [10 kN, 20 kN, 30 kN]
dv := [0.5 m, 2 m, 4 m]
h := hprod(Fv, dv)
soucet_h := sum(h) | J
k := kprod(Fv, dv)
soucet_k := sum(k) | J
tF := transpose(Fv)
tM := transpose([1 m, 2 m | 3 m, 4 m])
M := [1, 2 | 3, 4]
w := [5 m, 6 m, 7 m]
sp := M * w
