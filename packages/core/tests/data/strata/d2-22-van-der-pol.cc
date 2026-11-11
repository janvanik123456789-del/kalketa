# Van der Polův oscilátor s μ = 1000

μ := 1000                     ' parameter zabarvení
"Soustava: x′ = y, y′ = μ·(1 − x²)·y − x; relaxační kmitání s malou mírou rozumu."
solve (x(t), y(t)): x′ == y, y′ == μ·(1 - x^2)·y - x in 0 .. 3000
    x(0) == 2
    y(0) == 0
"Řešič s pevným krokem tuhou relaxační smyčku nezvládne."
check "Amplituda je konečná": abs(x(3000)) < 10
