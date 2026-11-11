# Hladký integrál ∫₀^π sin²x dx

"Integrační meze v radiánech, integrand je bezrozměrný."
I := integral(sin(x)^2, x: 0 .. π)
"Uzavřený tvar: ∫₀^π sin²x dx = π/2."
I_ana := π/2
check "Hladký integrál": abs(I - I_ana) < 1e-9
"Druhý hladký integrál pro jistotu: ∫₀^(2π) cos²x dx = π."
I2 := integral(cos(x)^2, x: 0 .. 2·π)
check "Druhý integrál": abs(I2 - π) < 1e-9
