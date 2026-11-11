# Výběr z tabulky materiálů a hmotnost tělesa

table Materialy:
    | oznaceni | hustota [kg/m^3] |
    | ocel | 7850 |
    | hlinik | 2700 |
    | beton | 2400 |
"Objem tělesa: deska 400 mm × 300 mm × 25 mm."
a := 400 mm
b := 300 mm
tl := 25 mm
V := a·b·tl | m³
radek := pick(Materialy, "ocel")
ρ := radek.hustota | kg/m³
m := ρ·V | kg
"Hmotnost desky z oceli je desítky kilogramů."
check "Hmotnost v rozumném rozsahu": m < 100 kg
"Totéž u hliníku, pro porovnání poměr hustot."
h_al := pick(Materialy, "hlinik").hustota
m_Al := h_al·V | kg
check "Poměr hmotností sedí s poměrem hustot": abs(m/m_Al - 7850/2700) < 1e-9
