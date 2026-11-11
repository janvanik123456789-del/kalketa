# Dávka 5 – list 10: irr s více změnami znaménka (dva kořeny) a npv se sazbou −50 %
CF := [-100, 230, -132]        ' dva překepy znaménka -> dva interní rychlosti (10 % a 20 %)
r1 := irr(CF)                  ' kterou z obou rychlostí Kalketa vrátí?
r2 := npv(0.1, CF)             ' při 10 % má vyjít nula
r3 := npv(0.2, CF)             ' při 20 % také nula
r4 := npv(-0.5, CF)            ' sazba -50 %
r5 := npv(0, CF)               ' sazba nula -> součet toků
