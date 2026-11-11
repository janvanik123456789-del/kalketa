# Dávka 7 – list 07: tabulka s textovým klíčem s diakritikou a mezerami; pick s jiným zápisem
table Materialy:
    | název | E [GPa] | pevnost [MPa] |
    | nerez ocel | 193 | 550 |
    | Ocel S235 | 210 | 235 |
    | hliník 6061-T6 | 69 | 276 |
E1 := pick(Materialy, "nerez ocel").E | GPa
E2 := pick(Materialy, "Ocel S235").pevnost | MPa
E3 := pick(Materialy, "Nerez Ocel").E | GPa
E4 := pick(Materialy, "ocel s235").E | GPa
E5 := pick(Materialy, "nerez  ocel").E | GPa
E6 := pick(Materialy, pevnost: 276 MPa).E | GPa
