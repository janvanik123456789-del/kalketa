# Plochy ve 3D – rotační tělesa, sedlo a vlny
"Vzorový list ke grafům ploch z(x, y). Každou plochu lze ukázat jako mapu s vrstevnicemi nebo ve 3D; 3D graf se otáčí tažením myší a natočení se uloží do řádku (view). Pravé tlačítko na grafu: Plocha jako mapa / Plocha ve 3D, Řez plochou…, Pohled shora, Vzhled grafu. U rotačních těles je pod plochou spočítán objem a porovnán se vzorcem."

## Polokoule
R := 1 m              ' poloměr koule
x_b := 0.5 m          ' bod na povrchu
y_b := 0.3 m
"Horní polovina koule se středem v počátku: z² + x² + y² = R². Mimo kruh x² + y² ≤ R² výraz nemá hodnotu, graf tam nechá prázdné místo a okraj dohledá přesně."
z(x, y) := sqrt(R^2 - x^2 - y^2)

"Mapa s vrstevnicemi: vrstevnice koule jsou soustředné kružnice, nejvyšší bod je uprostřed."
plot(z(x, y), x: -R .. R, y: -R .. R, points: [x_b, y_b]) | m

"Tatáž plocha ve 3D s řezem rovinou y = 0: v řezu je půlkružnice o poloměru R."
plot(z(x, y), x: -R .. R, y: -R .. R, kind: "surface", view: "az=35 el=30", samples: 60, cut: y == 0 m, points: [x_b, y_b]) | m

"Výška povrchu v bodě (x_b; y_b):"
z_b := z(x_b, y_b) | m

"Objem ze součtu kruhových plátků ve výšce h nad základnou: plátek má poloměr √(R² − h²), plochu π·(R² − h²) a tloušťku dh."
V := integral(π·(R^2 - h^2), h: 0 m .. R) | m^3
V_2 := 2/3·π·R^3 | m^3
check "Objem polokoule": V == V_2

## Rotační elipsoid (zploštělý)
a_e := 1 m            ' rovníková poloosa
c_e := 0.6 m          ' polární poloosa
"Elipsoid vznikne otočením elipsy kolem osy z: (x² + y²)/a² + z²/c² = 1. Polární poloosa je kratší než rovníková, elipsoid je zploštělý (jako Země)."
z_e(x, y) := c_e·sqrt(1 - (x^2 + y^2)/a_e^2)
plot(z_e(x, y), x: -a_e .. a_e, y: -a_e .. a_e, kind: "surface", view: "az=30 el=25", samples: 60, cut: x == 0 m) | m

"Plátek ve výšce h je kruh o poloměru a·√(1 − h²/c²):"
V_e := integral(π·a_e^2·(1 - h^2/c_e^2), h: 0 m .. c_e) | m^3
V_e2 := 2/3·π·a_e^2·c_e | m^3
check "Objem poloviny elipsoidu": V_e == V_e2

## Rotační paraboloid
p := 0.5 m            ' parametr paraboly
H_p := 1 m            ' výška hladiny v míse
"Paraboloid vznikne otočením paraboly z = r²/(2p) kolem osy z – tvar satelitní antény nebo hladiny v rotující nádobě. Řez rovinou x = 0 je parabola."
z_p(x, y) := (x^2 + y^2)/(2·p)
plot(z_p(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=40 el=28", cut: x == 0 m) | m

"Objem vody v míse do výšky H: plátek ve výšce h je kruh o poloměru √(2·p·h), plochu 2·π·p·h."
V_p := integral(2·π·p·h, h: 0 m .. H_p) | m^3
R_p := sqrt(2·p·H_p) | m          ' poloměr hladiny
"Objem paraboloidu je polovina objemu válce se stejnou podstavou a výškou (Archimedes):"
V_p2 := π·R_p^2·H_p/2 | m^3
check "Objem paraboloidu": V_p == V_p2

## Kužel
R_k := 1 m            ' poloměr podstavy
H_k := 1.2 m          ' výška
"Kužel nad kruhovou podstavou; mimo ni je plocha na nule. Vrstevnice kužele jsou soustředné kružnice ve stejných vzdálenostech (sklon je všude stejný), na rozdíl od koule a paraboloidu."
z_k(x, y) := max(0 m, H_k·(1 - sqrt(x^2 + y^2)/R_k))
plot(z_k(x, y), x: -R_k .. R_k, y: -R_k .. R_k, levels: 6) | m

"Plátek ve výšce h má poloměr R·(1 − h/H):"
V_k := integral(π·R_k^2·(1 - h/H_k)^2, h: 0 m .. H_k) | m^3
V_k2 := π·R_k^2·H_k/3 | m^3
check "Objem kužele": V_k == V_k2

## Anuloid (torus)
R_t := 0.7 m          ' poloměr středové kružnice
r_t := 0.25 m         ' poloměr trubice
"Horní polovina anuloidu: kruh o poloměru r otočený kolem osy z ve vzdálenosti R. Plocha má díru uprostřed i kolem dokola; okraje graf dohledá."
z_t(x, y) := sqrt(r_t^2 - (sqrt(x^2 + y^2) - R_t)^2)
plot(z_t(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=30 el=40", samples: 80, cut: y == 0 m) | m

"Objem horní poloviny: plátek ve výšce h je mezikruží o šířce 2·√(r² − h²) kolem kružnice R, plocha 4·π·R·√(r² − h²). Substitucí h = r·sin φ zmizí odmocnina:"
V_t := integral(4·π·R_t·r_t^2·cos(φ)^2, φ: 0 .. π/2) | m^3
"Pappova věta pro celý anuloid dává 2·π²·R·r², polovina:"
V_t2 := π^2·R_t·r_t^2 | m^3
check "Objem poloviny anuloidu": V_t == V_t2

## Sedlo
a := 1 m
"Hyperbolický paraboloid z = (x² − y²)/a má v počátku sedlo: ve směru x roste, ve směru y klesá. Hodnoty jdou na obě strany nuly, mapa je proto modrá–bílá–červená se středem v nule."
s(x, y) := (x^2 - y^2)/a
plot(s(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, levels: 8) | m
plot(s(x, y), x: -1 m .. 1 m, y: -1 m .. 1 m, kind: "surface", view: "az=-40 el=35", cut: x == 0 m) | m

## Vlnová plocha
A_w := 0.2 m          ' výška vlny
λ_w := 1 m            ' délka vlny
"Plocha z = A·sin(2πx/λ)·cos(2πy/λ) – střídají se hrboly a důlky jako na plátu na vajíčka. Na mapě je vidět pravidelná šachovnice vrstevnic."
w(x, y) := A_w·sin(2·π·x/λ_w)·cos(2·π·y/λ_w)
plot(w(x, y), x: 0 m .. 2 m, y: 0 m .. 1 m, levels: 6) | m
plot(w(x, y), x: 0 m .. 2 m, y: 0 m .. 1 m, kind: "surface", view: "az=25 el=45", samples: 60) | m
