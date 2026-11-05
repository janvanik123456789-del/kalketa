# Check in Python

The calculation of the sheet again, by another way: the instalment by halving an interval from the condition of a zero balance, the schedule month after month in a loop. The annuity formula is not used. The button above the script runs it in the built-in Python and puts the results beside the values of the sheet.

```python
# Month after month, as a bank would go, without the annuity formula for anything but the instalment.
P, rate, n = 300000.0, 0.06, 36
r = rate / 12


def balance_after(pay):
    # What remains of the loan after all instalments of this size.
    b = P
    for _ in range(n):
        b = b * (1 + r) - pay
    return b


# The instalment by halving, so the annuity formula of the sheet is checked and not repeated.
low, high = 0.0, P
for _ in range(200):
    pay = (low + high) / 2
    if balance_after(pay) > 0:
        low = pay
    else:
        high = pay

b = P
U = 0.0
first = last = None
b12 = None
for k in range(1, n + 1):
    interest = b * r
    b = b + interest - pay
    U += interest
    first = interest if first is None else first
    last = interest
    if k == 12:
        b12 = b

print("instalment", round(pay, 2), "interest", round(U, 2))
result("pay", pay, "Kč")
result("urok_1", first, "Kč")
result("urok_n", last, "Kč")
result("U", U, "Kč")
result("placeno", n * pay, "Kč")
result("podil", U / P * 100, "%")
result("i_ef", ((1 + r) ** 12 - 1) * 100, "%")
result("B_12", b12, "Kč")
```
