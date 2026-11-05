# Průběh vratné reakce A ⇌ B a čas do rovnováhy
"Vlastní zadání: látka A se v roztoku přeměňuje na izomer B a B zpět na A. Obě reakce jsou prvního řádu. Na začátku je v roztoku jen A. Hledáme průběh obou koncentrací, jejich hodnoty po 10 minutách a čas, za který reakce urazí 90 % cesty k rovnováze. Dvě rovnice jsou provázané, proto se řeší jako soustava."
"Zdroj: vlastní zadání, ověřeno přesným řešením (oddíl 4 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
k_1 := 0.002 1/s         ' rychlostní konstanta A → B
k_2 := 0.001 1/s         ' rychlostní konstanta B → A
a_0 := 1 mol/l           ' počáteční koncentrace A
b_0 := 0 mol/l           ' počáteční koncentrace B
t_e := 3600 s            ' doba sledování

## Soustava rovnic
"Úbytek A je přeměna na B zmenšená o přeměnu zpět, u B naopak. Kalketa soustavu integruje a výsledkem jsou funkce a(t) a b(t) i s derivacemi."
solve (a(t), b(t)): a′ == -k_1·a + k_2·b, b′ == k_1·a - k_2·b in 0 s .. t_e
    a(0 s) == a_0
    b(0 s) == b_0
plot(a(t), b(t), t: 0 s .. t_e, title: "Koncentrace A a B v čase", xlabel: "t", ylabel: "c") | mol/l

## Hodnoty z řešení
a_600 := a(600 s) | mol/l
b_600 := b(600 s) | mol/l
a_e := a(t_e) | mol/l
b_e := b(t_e) | mol/l
r_e := a′(t_e) | mol/(l·s)

## Rovnováha a přesné řešení
"V rovnováze se obě přeměny vyrovnají, k_1·a = k_2·b. Soustava má i přesné řešení: odchylka od rovnováhy klesá exponenciálně s časovou konstantou 1/(k_1 + k_2), která závisí na součtu obou konstant."
K := k_1/k_2
a_r := a_0·k_2/(k_1 + k_2) | mol/l
b_r := a_0·k_1/(k_1 + k_2) | mol/l
τ := 1/(k_1 + k_2) | s
t_90 := τ·ln(10) | s
a_90 := a(t_90) | mol/l
a_presne := a_r + (a_0 - a_r)·exp(-600 s/τ) | mol/l

## Posudky
check "Celkové množství se nemění": abs(a(t_e/3) + b(t_e/3) - a_0) ≤ 1e-6 mol/l
check "Numerické řešení jako přesné": abs(a_600 - a_presne) ≤ 1e-5 mol/l
check "Na konci je poměr koncentrací rovnovážná konstanta": abs(b_e/a_e - K) ≤ 0.01
check "Za t_90 je urazeno 90 % cesty k rovnováze": abs((a_0 - a_90) - 0.9·(a_0 - a_r)) ≤ 1e-5 mol/l
"Po 10 minutách zbývá 0,444 mol/l látky A. Rovnováha je v poměru 1 : 2 a 90 % cesty k ní reakce urazí za 768 s. Čas k rovnováze určuje součet konstant, proto by zpětná reakce s větší konstantou rovnováhu nejen posunula, ale i uspíšila."
