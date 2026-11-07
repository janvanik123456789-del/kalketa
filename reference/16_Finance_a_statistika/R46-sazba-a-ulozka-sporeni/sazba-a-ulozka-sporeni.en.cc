# Interest rate and monthly deposit of savings from two balances
"After example 6 of a lecture on savings in financial mathematics (course 1BP310, Prague University of Economics and Business): a saver pays into an account at the end of every month, and interest is credited quarterly. After 5 years 500 000 Kč has been saved, 75 000 Kč of it is withdrawn, and after 10 years 1 100 000 Kč has been saved. We look for the annual interest rate and the monthly deposit. The task says nothing about tax on interest, so we calculate without it."
"Source: J. Radová, Spoření (Finanční matematika 1BP310), VŠE Praha, https://esf1.vse.cz/wp-content/uploads/page/26/1BP310_Sporeni_opraveno.pdf"

![Account timeline: deposits at the end of each month, balance 500 000 Kč after 5 years, withdrawal of 75 000 Kč and balance 1 100 000 Kč after 10 years](images/sazba-a-ulozka-sporeni.en.svg){width=90%}

## Input
S_5 := 500000 Kč          ' saved after 5 years
V := 75000 Kč             ' withdrawal at the end of year 5
S_10 := 1100000 Kč        ' saved after 10 years
m := 3                    ' deposits per quarter
n := 4·5                  ' quarters in 5 years

## Savings
"Deposits within a quarter earn simple interest (the deposit at the end of the k-th month for the rest of the quarter), the quarters compound among themselves. One quarterly deposit is then a·(m + i/12·(m − 1)·m/2), and the end-of-period accumulation factor is s_n = ((1 + i/4)^n − 1)/(i/4)."
X(a, i) := a·(m + i/12·(m - 1)·m/2)
s(i) := ((1 + i/4)^n - 1)/(i/4)

"Two unknowns, two conditions: the first says that the account holds S_5 after 5 years, the second that the remainder after the withdrawal, earning interest for another 5 years together with the new deposits, gives S_10."
solve (i, a):
    X(a, i)·s(i) == S_5
    (S_5 - V)·(1 + i/4)^n + X(a, i)·s(i) == S_10
    guess i = 5 %, a = 5000 Kč

## Balance quarter by quarter
"The balance earns the quarterly rate, a quarterly deposit is added at the end of the quarter; after 20 quarters V is withdrawn."
j := i/4
S_kontrola := (S_5 - V)·(1 + j)^n + X(a, i)·s(i)
"Balance after q quarters (whole q are quarter ends, between them the line only connects the points; the sharp drop is the withdrawal):"
B(q) := if(q <= n, X(a, i)·((1 + j)^q - 1)/j, (S_5 - V)·(1 + j)^(q - n) + X(a, i)·((1 + j)^(q - n) - 1)/j)
plot(B(x), x: 0 .. 40, title: "Account balance by quarter", xlabel: "Quarter", ylabel: "Kč")

## Checks
check "500 000 Kč saved after 5 years": abs(B(n) - S_5) ≤ 0.01 Kč
check "1 100 000 Kč saved after 10 years": abs(S_kontrola - S_10) ≤ 0.01 Kč
check "The deposit comes out as a round thousand (the task was built from 7 000 Kč)": abs(a - 7000 Kč) ≤ 2 Kč
"The annual rate comes out at about 6.96 % and the monthly deposit at 6 999 Kč, almost exactly 7 000 Kč: the task was evidently built from a deposit of 7 000 Kč (the source shows its solution only as images of formulas, so we compare with this evident original). The quarterly rate is i/4 = 1.739 %."
