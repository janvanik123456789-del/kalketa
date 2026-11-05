# Balancing a chemical equation

The theory behind the calculation, in our own words. Kalketa verifies the formulas in the boxes.

## An equation as a system

In a reaction atoms are neither created nor destroyed. So for each element the number of its atoms on the left equals the number on the right. The coefficients of the equation are unknowns and each element gives one linear equation. When the products are written with a negative sign, all equations have a zero right side: we look for a vector that the matrix of elements sends to zero, its **null space**.

The equation fixes only the ratio of the coefficients. Multiplying everything by two gives the same reaction. That is why the smallest whole numbers are taken from the null space.

## A simple example

The combustion of propane C₃H₈ + O₂ → CO₂ + H₂O has the elements C, H, O and four substances:

```kalk
A := [3, 0, -1, 0 | 8, 0, 0, -2 | 0, 2, -2, -1]
c := whole(nullspace(A))
check "C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O": c[1] == 1 and c[2] == 5 and c[3] == 3 and c[4] == 4
```

## When it is not so easy

- **Rank smaller by more than one:** the equation has more independent balances, because in fact several reactions run at once. The null space then has several columns and chemistry has to decide in what ratio the reactions run.
- **Rank equal to the number of substances:** the only solution is zeros, so the equation cannot be balanced. Usually a substance is missing, for example water.
- **Redox reactions** like this one can also be balanced by the exchange of electrons: manganese takes 5 electrons, chlorine gives one. The matrix manages without knowing oxidation numbers. Checking the oxidation numbers is still a good way to verify the result.

## Stoichiometry

The amounts of substance are in the ratio of the coefficients. From the mass of one substance the amounts of all the others and their masses follow. The mass balance is an independent check: the sum of molar masses times coefficients has to come out the same on both sides.
