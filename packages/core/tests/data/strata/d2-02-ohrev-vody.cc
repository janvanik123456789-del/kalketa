# Ohřev vody 15 °C na 60 °C

m := 250 kg                   ' hmotnost vody
c_v := 4186 J/(kg·K)          ' měrná tepelná kapacita vody
T_1 := 15 °C
T_2 := 60 °C
"Rozdíl dvou absolutních teplot je difference; °C a K v ní musí souhlasit."
ΔT := T_2 - T_1 | Δ°C
ΔT_K := T_2 - T_1 | K
check "Δ°C souhlasí s K": ΔT == ΔT_K
Q := m·c_v·ΔT | MJ
Q_kWh := Q | kWh
"Teplo na ohřev 250 kg vody o 45 K je desítky kWh."
check "Energie ve správném rozsahu": Q_kWh < 20 kWh
