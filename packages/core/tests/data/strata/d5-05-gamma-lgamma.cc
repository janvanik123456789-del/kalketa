# Dávka 5 – list 05: gamma a lgamma pro velké argumenty a blízko záporných celých čísel
g1 := gamma(170.5)             ' tesne pod mezn double (170! je nejvyssi faktoriel)
g2 := gamma(171)               ' 170! -> uz pretecne?
g3 := gamma(1e5)               ' astronomicky velke
g4 := lgamma(1e5)
g5 := lgamma(170.5)
g6 := gamma(-0.5)              ' na polovine mezi zapornymi celymi cisly
g7 := gamma(-1.5)
g8 := gamma(-2.5)
g9 := lgamma(-0.5)             ' gamma zaporna -> lgamma bere absolutni hodnotu?
g10 := gamma(-1)               ' pól (záporné celé číslo)
