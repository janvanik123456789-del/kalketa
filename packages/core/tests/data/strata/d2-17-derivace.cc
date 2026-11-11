# Derivace součinu x³·sin x

f(x) := x³·sin(x)
"Analytická derivace: f′(x) = 3x²·sin x + x³·cos x, v bodě x = 1."
fp_ana(x) := 3·x²·sin(x) + x³·cos(x)
d_num := derivative(f(x), x: 1, order: 1)
d_ana := fp_ana(1)
check "Číselná derivace sedí s analytickou": abs(d_num - d_ana) < 1e-7
"Druhá derivace pro hodinu další kontroly."
d2_num := derivative(f(x), x: 1, order: 2)
fpp_ana(x) := 6·x·sin(x) + 6·x²·cos(x) - x³·sin(x)
d2_ana := fpp_ana(1)
check "Druhá derivace": abs(d2_num - d2_ana) < 1e-6
