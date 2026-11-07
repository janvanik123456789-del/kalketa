# Kontrola v Pythonu

Výpočet listu znovu a nezávisle: nejdřív uzavřeným tvarem bez řešiče, potom simulací účtu měsíc po měsíci.

```python
S5, V, S10 = 500_000.0, 75_000.0, 1_100_000.0
n = 20
# oba stavy účtu dají (1 + j)^20 = (S10 - S5)/(S5 - V)
j = ((S10 - S5) / (S5 - V)) ** (1 / n) - 1
i = 4 * j
s = ((1 + j) ** n - 1) / j
X = S5 / s                      # čtvrtletní úložka
a = X / (3 + i / 12 * 3)        # měsíční úložka: X = a (3 + i/12 (2 + 1))


def account(a, i, months, withdraw_at=None, withdraw=0.0):
    balance, interest = 0.0, 0.0
    for month in range(1, months + 1):
        interest += balance * i / 12     # jednoduchý úrok měsíce ze zůstatku
        balance += a                     # úložka koncem měsíce
        if month % 3 == 0:               # úrok se připíše koncem čtvrtletí
            balance += interest
            interest = 0.0
        if withdraw_at == month:
            balance -= withdraw
    return balance


print(f"simulace: po 5 letech {account(a, i, 60):.2f} Kč, po 10 letech {account(a, i, 120, 60, V):.2f} Kč")
result("i", 100 * i, "%")
result("j", 100 * j, "%")
result("a", a, "Kč")
result("S_kontrola", account(a, i, 120, 60, V), "Kč")
```
