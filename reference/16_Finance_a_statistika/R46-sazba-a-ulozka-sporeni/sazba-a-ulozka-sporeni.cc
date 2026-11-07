# Úroková sazba a měsíční úložka spoření ze dvou stavů účtu
"Podle příkladu 6 přednášky Spoření (Finanční matematika 1BP310, VŠE Praha, J. Radová): spoří se pravidelně koncem měsíce na účet se čtvrtletním připisováním úroků. Po 5 letech je naspořeno 500 000 Kč, z toho se vybere 75 000 Kč, a po 10 letech je naspořeno 1 100 000 Kč. Hledáme roční úrokovou sazbu a měsíční úložku. Daň z úroků zadání neuvádí, počítáme bez ní."
"Zdroj: https://esf1.vse.cz/wp-content/uploads/page/26/1BP310_Sporeni_opraveno.pdf"

![Osa času účtu: úložky koncem měsíců, stav 500 000 Kč po 5 letech, výběr 75 000 Kč a stav 1 100 000 Kč po 10 letech](images/sazba-a-ulozka-sporeni.svg){width=90%}

## Zadání
S_5 := 500000 Kč          ' naspořeno po 5 letech
V := 75000 Kč             ' výběr na konci 5. roku
S_10 := 1100000 Kč        ' naspořeno po 10 letech
m := 3                    ' úložek za čtvrtletí
n := 4·5                  ' čtvrtletí za 5 let

## Spoření
"Úložky během čtvrtletí se úročí jednoduše (úložka koncem k-tého měsíce po zbytek čtvrtletí), čtvrtletí mezi sebou složeně. Jedna čtvrtletní úložka je pak a·(m + i/12·(m − 1)·m/2), střadatel polhůtní s_n = ((1 + i/4)^n − 1)/(i/4)."
X(a, i) := a·(m + i/12·(m - 1)·m/2)
s(i) := ((1 + i/4)^n - 1)/(i/4)

"Dvě neznámé, dvě podmínky: první říká, že za 5 let je na účtu S_5, druhá, že zbytek po výběru zúročený dalších 5 let spolu s novými úložkami dá S_10."
solve (i, a):
    X(a, i)·s(i) == S_5
    (S_5 - V)·(1 + i/4)^n + X(a, i)·s(i) == S_10
    guess i = 5 %, a = 5000 Kč

## Stav účtu čtvrtletí po čtvrtletí
"Zůstatek se úročí čtvrtletní sazbou, na konci čtvrtletí přibude čtvrtletní úložka; po 20 čtvrtletích se vybere V."
j := i/4
S_kontrola := (S_5 - V)·(1 + j)^n + X(a, i)·s(i)
"Stav po q čtvrtletích (q celé jsou konce čtvrtletí, mezi nimi se čára jen spojuje; svislý skok je výběr):"
B(q) := if(q <= n, X(a, i)·((1 + j)^q - 1)/j, (S_5 - V)·(1 + j)^(q - n) + X(a, i)·((1 + j)^(q - n) - 1)/j)
plot(B(x), x: 0 .. 40, title: "Stav účtu po čtvrtletích", xlabel: "Čtvrtletí", ylabel: "Kč")

## Kontroly
check "Po 5 letech naspořeno 500 000 Kč": abs(B(n) - S_5) ≤ 0.01 Kč
check "Po 10 letech naspořeno 1 100 000 Kč": abs(S_kontrola - S_10) ≤ 0.01 Kč
check "Úložka vychází na celé tisíce (zadání vzniklo z 7 000 Kč)": abs(a - 7000 Kč) ≤ 2 Kč
"Roční sazba vychází asi 6,96 % a měsíční úložka 6 999 Kč, tedy téměř přesně 7 000 Kč: zadání zřejmě vzniklo z úložky 7 000 Kč (zdroj ukazuje řešení jen jako obrázky vzorců, proto porovnáváme s tímto zjevným původním zadáním). Čtvrtletní sazba je i/4 = 1,739 %."
