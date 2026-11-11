# Výkon a točivý moment motoru

P := 15 kW                    ' jmenovitý výkon
n := 1500 rpm                 ' otáčky
"Ot/min jsou frekvence otáčení, ω = 2π·n; převod minut na sekundy dělá jednotka sama."
f := n | Hz
ω := 2·π·n | rad/s
M := P/ω | N·m
"Totéž zapsané jedním výrazem."
M_kontrola := P/(2·π·n) | N·m
check "Dva zápisy téhože momentu": M == M_kontrola
check "Frekvence otáčení je 25 Hz": f == 25 Hz
