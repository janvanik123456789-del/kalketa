# Integrovatelná singularita ∫₀¹ 1/√x dx

"Integrand v nule roste nade všechny meze, integrál je však konečný a roven 2."
I := integral(1/sqrt(x), x: 0 .. 1)
I_ana := 2
check "Integrál se singularitou": abs(I - I_ana) < 1e-9
"Srovnání: se stejnou singularitou, ale dolní mezí 1e-6, vyjde 2 − 2·10⁻³."
I_eps := integral(1/sqrt(x), x: 1e-6 .. 1)
check "Odmezená varianta": abs(I_eps - (2 - 2e-3)) < 1e-9
"Neskutečně singulární integrand už přesnost nedá: varování."
I_nesmysl := integral(1/x, x: 0 .. 1)
