# Chyba v tabulce – neexistující klíč

table Materialy:
    | oznaceni | hustota [kg/m^3] |
    | ocel | 7850 |
    | hlinik | 2700 |
"Řádek s názvem titr existuje; název měd tu není a musí se to ohlásit."
m_good := pick(Materialy, "ocel").hustota | kg/m³
rho_chyba := pick(Materialy, "med").hustota | kg/m³
