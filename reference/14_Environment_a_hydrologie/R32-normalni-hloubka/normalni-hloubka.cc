# Drsnost a normální hloubka v lichoběžníkovém korytě (Manning)
"Podle skript Fluid Mechanics, kapitola 8 Open Channel Flow (University of Mustansiriyah), řešené příklady 3 a 4. Lichoběžníkovým korytem se šířkou dna 8 m a svahy 1 : 1,5 teče 56 m³/s, sklon dna je 0,0009. Nejdřív z hloubky 2 m, naměřené při tomto průtoku, určíme Manningův součinitel drsnosti. Pak pro drsnost 0,017 najdeme normální hloubku, při které je proudění rovnoměrné. Průřez je nakreslený vlastní."

## Zadání
b := 8 m                      ' šířka dna
m_s := 1.5                    ' sklon svahů 1 : m_s
I_0 := 0.0009                 ' podélný sklon dna
Q := 56 m^3/s
![Lichoběžníkový průřez korytem: šířka dna b, hloubka y, svahy 1 : m_s, šířka v hladině b + 2·m_s·y](images/koryto.svg){width=70%}
"Průtočná plocha, omočený obvod a hydraulický poloměr jako funkce hloubky:"
S_p(y) := (b + m_s·y)·y
O_p(y) := b + 2·y·sqrt(1 + m_s^2)
R_h(y) := S_p(y)/O_p(y)

## Drsnost z naměřené hloubky (příklad 3)
y_1 := 2 m
R_1 := R_h(y_1) | m
"Manningova rovnice Q = S·R^(2/3)·√I/n, řešená pro n:"
n_1 := S_p(y_1)·R_1^(2/3)·sqrt(I_0)/Q | s/m^(1/3) {eq}
"Zdroj: n = 0,01507."

## Normální hloubka pro n = 0,017 (příklad 4)
n := 0.017 s/m^(1/3)
"Normální hloubka je ta, při které Manningova rovnice dá zadaný průtok:"
solve y_n: S_p(y_n)·R_h(y_n)^(2/3)·sqrt(I_0)/n == Q in 0.5 m .. 5 m
v := Q/S_p(y_n) | m/s
"Zdroj zkoušením: 2,137 m. Koryto s větší drsností (0,017 proti 0,0151) potřebuje k převedení stejného průtoku větší hloubku."
"Měrná křivka koryta, průtok při rovnoměrném proudění podle hloubky:"
Q_y(y) := S_p(y)·R_h(y)^(2/3)·sqrt(I_0)/n
plot(Q_y(y), y: 0.2 m .. 3 m, title: "Měrná křivka koryta (n = 0,017)") | m^3/s
