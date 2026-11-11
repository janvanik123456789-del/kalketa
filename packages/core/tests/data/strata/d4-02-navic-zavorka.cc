# Dávka 4 – list 02: přebytečná pravá závorka
hm := 12 kg                      ' hmotnost břemene
g := 9.81 m/s^2                  ' tíhové zrychlení
F := (hm*g)) | N                 ' CHYBA: závorka navíc
A := 0.25 m^2                    ' plocha podložky
p := F/A | kPa
tau := 40 MPa
u := p/tau                       ' vyuziti (bez rozpoctu)
