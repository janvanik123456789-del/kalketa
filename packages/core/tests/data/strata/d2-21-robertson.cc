# Robertsonova tuhá soustava do t = 40

"Kapitálový příklad tuhých chemických drah: a′ = −0.04a + 1e4·b·c, b′ = 0.04a − 1e4·b·c − 3e7·b², c′ = 3e7·b²."
solve (a(t), b(t), c(t)): a′ == -0.04·a + 1e4·b·c, b′ == 0.04·a - 1e4·b·c - 3e7·b^2, c′ == 3e7·b^2 in 0 .. 40
    a(0) == 1
    b(0) == 0
    c(0) == 0
"Řešení má platit až do konce intervalu, zde však metoda s pevným krokem nestačí."
check "Zachování hmoty": abs(a(40) + b(40) + c(40) - 1) < 1e-6
