# Sonda P5 — odděluji příčiny selhání first(): nedělohraniční meze vs. jednotky
a1 := first((x / 1 m)^2 > 5, x: 0 m .. 3 m)
a2 := first((x / 1)^2 > 5, x: 0.1 .. 3)
a3 := first((x / 1)^2 > 5, x: 0 .. 3.5)
a4 := first((x / 1 m)^2 > 5, x: 0 m .. 3.5 m)
a5 := first((x / 1 cm)^2 > 5, x: 0 cm .. 3 cm)
a6 := first((x / 1 m)^2 > 5, x: 0 .. 3)
