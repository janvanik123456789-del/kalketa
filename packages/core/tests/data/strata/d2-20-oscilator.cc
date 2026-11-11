# Netlumený harmonický oscilátor na deseti periodách

ω := 2 rad/s                  ' úhlová frekvence
T := 2·π/ω | s                ' perioda
doba := 10·T | s
"Soustava prvního řádu: x′ = v, v′ = −ω²·x; počáteční výchylka 1 m, nulová rychlost."
solve (x(t), v(t)): x′ == v, v′ == -ω²·x in 0 s .. doba
    x(0 s) == 1 m
    v(0 s) == 0 m/s
"Měrná energie (na jednotku hmotnosti) E = ½(v² + ω²x²) se musí zachovat."
E_0 := (v(0 s)^2 + ω²·x(0 s)^2)/2 | J/kg
E_stred := (v(doba/2)^2 + ω²·x(doba/2)^2)/2 | J/kg
E_konec := (v(doba)^2 + ω²·x(doba)^2)/2 | J/kg
check "Zachování energie ve středisku": abs(E_stred - E_0) < 1e-4·E_0
check "Zachování energie na konci": abs(E_konec - E_0) < 1e-4·E_0
"Po celých deseti periodách se musí vrátit výchylka i rychlost."
x_konec := x(doba) | m
v_konec := v(doba) | m/s
check "Návrat do výchylky": abs(x_konec - 1 m) < 1e-4 m
check "Návrat do nulové rychlosti": abs(v_konec) < 1e-4 m/s
