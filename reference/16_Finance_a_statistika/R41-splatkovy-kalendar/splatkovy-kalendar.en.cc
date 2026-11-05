# Repayment schedule of a loan with equal instalments
"Own task: a consumer loan of 300 000 Kč is repaid in 36 equal monthly instalments at an annual interest rate of 6 %, compounded monthly. We look for the instalment and, for each month, the interest, the principal part and the remaining balance. Each row of the schedule reads the balance from the row above it. Fees and bank rounding are not considered."
"Source: own task, verified by the closed formula for the balance (section 4 of the sheet) and independently in Python (Check in Python layer)."

## Input
P := 300000 Kč           ' amount of the loan
i_r := 6 %               ' annual interest rate
n := 36                  ' number of monthly instalments

## The instalment
"The instalment is an annuity: the present value of all instalments equals the loan."
r := i_r/12
pay := P·r/(1 - (1 + r)^(-n)) | Kč

## Schedule
"The interest is calculated from the balance of the previous month, the rest of the instalment repays the principal. prev(B, P) is the balance one row up, in the first row the loan P."
table Splatky: {rows=1..n}
    | k | urok [Kč] {0.00} = prev(B, P)·r | umor [Kč] {0.00} = pay - urok | B [Kč] {0.00} = prev(B, P) - umor |
    | Total | Σ | Σ | |
plot(Splatky.urok, Splatky.umor, x: Splatky.k, title: "Instalment split into interest and principal", xlabel: "Month", ylabel: "Kč")
plot(Splatky.B, x: Splatky.k, title: "Remaining balance", xlabel: "Month", ylabel: "Kč")

## Summary
urok_1 := Splatky.urok[1] | Kč
urok_n := Splatky.urok[n] | Kč
U := sum(Splatky.urok) | Kč
placeno := n·pay | Kč
podil := U/P | %
i_ef := (1 + r)^12 - 1 | %

## Checks
"The closed formula also gives the balance after twelve instalments, without the schedule. It has to agree with the twelfth row of the table."
B_12 := P·(1 + r)^12 - pay·((1 + r)^12 - 1)/r | Kč
check "No balance remains after the last instalment": abs(Splatky.B[n]) ≤ 0.01 Kč
check "The principal parts add up to the whole loan": abs(sum(Splatky.umor) - P) ≤ 0.01 Kč
check "The interest is the difference between what was paid and what was borrowed": abs(U - (placeno - P)) ≤ 0.01 Kč
check "Balance after 12 instalments as from the closed formula": abs(Splatky.B[12] - B_12) ≤ 0.01 Kč
"The instalment is 9126.58 Kč and the interest over three years comes to 28 556.92 Kč, which is 9.52 % of the loan. Interest takes 1500 Kč of the first instalment and only 45.41 Kč of the last: the instalment stays the same, but its split gradually moves towards the principal."
