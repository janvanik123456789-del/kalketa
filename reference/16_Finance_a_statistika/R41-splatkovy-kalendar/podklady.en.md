# Repaying a loan

The theory behind the calculation, in our own words. Kalketa verifies the formulas in the boxes.

## Where the formula for the instalment comes from

Money has a different value at different times. An instalment paid in k months is worth pay/(1 + r)^k today, where r is the interest for one month. The loan is repaid when the sum of today's values of all instalments equals the amount borrowed. That is a geometric series and its sum gives

P = pay·(1 − (1 + r)^(−n))/r

The instalment follows from it. Putting it back has to return the loan:

```kalk
P := 300000 Kč
r := 0.005
n := 36
pay := P·r/(1 - (1 + r)^(-n))
Z := pay·(1 - (1 + r)^(-n))/r
check "The present value of the instalments is the loan": abs(Z - P) ≤ 0.01 Kč
```

## Why the interest gets smaller

In each month B_k = B_(k−1)·(1 + r) − pay. Interest is calculated only from the remaining balance, so it falls with the balance. The instalment stays the same, so more and more of it repays the principal. The principal parts grow geometrically with the ratio (1 + r).

## Nominal and effective rate

A rate of 6 % a year compounded monthly means 0.5 % a month. Because interest earns interest, a balance without repayments grows by more than 6 % in a year, namely by (1 + r)^12 − 1. The real cost of a loan is further raised by fees, which this calculation leaves out. Only the annual percentage rate of charge includes them.

## A table that reads itself

A column of a table can read the previous row: `prev(B, P)` is the value of the column `B` one row up, in the first row `P`. Other procedures where each step follows from the one before can be written the same way, for example a balance with another rate from a certain month. It is enough to express the rate by the row number `k`, say `if(k ≤ 12, r, r_2)`.
