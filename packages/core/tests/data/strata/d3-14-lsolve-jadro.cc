# 14 — lsolve, inverze, singularita, jádro matice
# Reference: Cramerovo pravidlo ve zlomcích (fractions) pro 3x3, NumPy linalg.solve.

A := [2, 1, -1 | 3, -1, 2 | 1, 2, 1]
b := [8, 11, 3]
x_lsolve := lsolve(A, b)
x_inverze := inverse(A)·b
kontrola := A·x_lsolve

C := [1, 2 | 2, 4]
d := [3, 6]
singularni := lsolve(C, d)
inverze_singularni := inverse(C)

E := [1, 2, 3 | 2, 4, 6 | 1, 1, 1]
jadro := nullspace(E)
soucin_jadra := E·jadro
norma_jadra := norm(jadro)

F := [1, 2, 3 | 4, 5, 6]
g := [1, 2, 3]
obdelnik := lsolve(F, g)

s_jednotkami := lsolve([2, 0 | 0, 4] m, [10 N, 20 N])
krize := lsolve([2, 1 | 1, 2] m, [10 N, 20 N])

badar := lsolve(A, [1, 2])

check "lsolve sedí na Cramer (35/9, -2/9, -4/9)": abs(sum(x_lsolve) - 29 / 9) < 1e-12 and abs(x_lsolve[1] / (35 / 9) - 1) < 1e-12
check "lsolve a inverze dávají totéž": abs(max(abs(x_lsolve - x_inverze))) < 1e-12
check "A·x = b": abs(max(abs(kontrola - b))) < 1e-11
check "jádro je skutečně nulové": norm(soucin_jadra) < 1e-12
check "singulární matici nelzeinvertovat": norm(jadro) > 0
