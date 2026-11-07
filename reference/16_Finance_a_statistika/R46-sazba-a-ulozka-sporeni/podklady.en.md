# Savings with quarterly crediting of interest

The theory behind the calculation, in our own words. Kalketa checks the formulas in the boxes.

## Deposits within a quarter

The saver pays in at the end of every month, interest is credited at the end of each quarter. A deposit made at the end of the first month earns interest for two months, the second for one month, the third for none. With simple interest inside the quarter at annual rate i, the three monthly deposits a are worth one quarterly deposit paid at the end of the quarter:

```kalk
a := 1000 Kč
i := 6 %
m := 3
X := a·(m + i/12·(m - 1)·m/2)
check "three deposits per quarter with interest for 2 + 1 months": abs(X - a·(3 + i/12·3)) ≤ 0.001 Kč
```

## Quarterly accumulation factor

Quarterly deposits X at quarterly rate j = i/4 over n quarters give the end-of-period accumulation factor s = ((1 + j)^n − 1)/j. For j = 1 % and n = 4 it is 4.0604:

```kalk
j := 1 %
n := 4
s := ((1 + j)^n - 1)/j
check "accumulation factor for 1 % and 4 periods": abs(s - 4.060401) ≤ 0.00001
```

## Two unknowns from two balances

After five years X·s = S₅. After the withdrawal V, the amount S₅ − V remains, which only earns interest for another five years, and new deposits are added with the same factor:

(S₅ − V)·(1 + j)^20 + X·s = S₁₀.

Substituting the first equation into the second removes the deposit and leaves one equation for the rate, which can be solved on its own: (1 + j)^20 = (S₁₀ − S₅)/(S₅ − V).

```kalk
S_5 := 500000 Kč
V := 75000 Kč
S_10 := 1100000 Kč
j := ((S_10 - S_5)/(S_5 - V))^(1/20) - 1
check "quarterly rate from the closed form": abs(j - 1.73915 %) ≤ 0.0001 %
```
