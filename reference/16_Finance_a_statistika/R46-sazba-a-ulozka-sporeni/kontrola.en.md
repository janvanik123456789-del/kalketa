# Check in Python

The sheet calculation again, independently: first the closed form without a solver, then a month-by-month simulation of the account.

```python
S5, V, S10 = 500_000.0, 75_000.0, 1_100_000.0
n = 20
# both balances give (1 + j)^20 = (S10 - S5)/(S5 - V)
j = ((S10 - S5) / (S5 - V)) ** (1 / n) - 1
i = 4 * j
s = ((1 + j) ** n - 1) / j
X = S5 / s                      # quarterly deposit
a = X / (3 + i / 12 * 3)        # monthly deposit: X = a (3 + i/12 (2 + 1))


def account(a, i, months, withdraw_at=None, withdraw=0.0):
    balance, interest = 0.0, 0.0
    for month in range(1, months + 1):
        interest += balance * i / 12     # simple interest of the month on the balance
        balance += a                     # deposit at the end of the month
        if month % 3 == 0:               # interest is credited at the end of the quarter
            balance += interest
            interest = 0.0
        if withdraw_at == month:
            balance -= withdraw
    return balance


print(f"simulation: after 5 years {account(a, i, 60):.2f} Kč, after 10 years {account(a, i, 120, 60, V):.2f} Kč")
result("i", 100 * i, "%")
result("j", 100 * j, "%")
result("a", a, "Kč")
result("S_kontrola", account(a, i, 120, 60, V), "Kč")
```
