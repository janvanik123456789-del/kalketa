# Faktoriál – přesnost a mez oboru

"20! je nejvyšší faktoriál, který se vejde do celých číslic bez ztráty; program hlídá 170! jako nejvyšší v oboru čísel."
f20 := factorial(20) {decimals=0}
f20_rucne := 2432902008176640000 {decimals=0}
check "20! je přesně 2 432 902 008 176 640 000": f20 == f20_rucne
"Rekurze musí platit: 20!/19! = 20."
f19 := factorial(19) {decimals=0}
check "Rekurze faktoriálu": f20/f19 == 20
"170! je ještě konečné číslo, 171! už je mimo obor."
f170 := factorial(170)
check "170! je kladné a konečné": f170 > 0
