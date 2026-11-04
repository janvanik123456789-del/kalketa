# Hloubka vzdutí řeky, při níž se otevře čtvrtkruhový uzávěr
"Podle úlohy 2.3 sbírky Hydromechanik – Übungsaufgaben (KIT Karlsruhe, G. H. Jirka, T. Bleninger, 2001): uzávěr tvaru čtvrtkruhové výseče o poloměru R odděluje řeku od moře. Je otočný v kloubu D nahoře a v bodě A dole doléhá na těsnění. Zleva na svislou stěnu tlačí říční voda (hladina o t nad kloubem), zprava na oblouk slaná voda (hladina v úrovni kloubu). Pod uzávěrem voda není (zdroj to u úlohy výslovně neříká; vyplývá z obrázku, kde uzávěr leží na dně). Určíme přítlak v těsnění na metr šířky a hloubku t_0, při které se uzávěr otevře. Zdroj řešení neuvádí, řešení i obrázek jsou vlastní."
"Zdroj: https://publikationen.bibliothek.kit.edu/1512004/1539 (úloha bez řešení; řešení vlastní)"

## Zadání
R := 1.0 m
ρ_F := 997 kg/m^3         ' říční voda
ρ_S := 1025 kg/m^3        ' slaná voda
g := 9.81 m/s^2
G := 30 kN/m              ' tíha uzávěru na metr šířky
s_G := R/3                ' rameno tíhy od svislé stěny
![Čtvrtkruhový uzávěr: kloub D, střed O pod ním, těsnění A; vlevo říční voda o t nad kloubem, vpravo slaná voda v úrovni kloubu; tíha G s ramenem s_G a přítlak F_A v těsnění](images/uzaver.svg){width=80%}

## Slaná voda na oblouku
"Tlak na oblouk míří do středu O pod kloubem; svislá složka výslednice proto ke kloubu D moment nemá, vodorovná na rameni R ano."
H_S := integral(ρ_S·g·s, s: 0 m .. R) | kN/m
M_S := R·H_S | kN·m/m

## Říční voda na svislé stěně
"Hloubka pod kloubem s, tlak ρ_F·g·(t + s), rameno ke kloubu s:"
M_F(t) := integral(ρ_F·g·(t + s)·s, s: 0 m .. R)
F_A(t) := (M_S + G·s_G - M_F(t))/R
M_G := G·s_G | kN·m/m

## Kdy se uzávěr otevře
"Uzávěr se otevře, když přítlak v těsnění F_A klesne na nulu:"
solve t_0: M_F(t_0) == M_S + M_G guess t_0 = 1 m
F_A0 := F_A(0 m) | kN/m
F_A1 := F_A(1 m) | kN/m
check "Při t_0 je přítlak nulový": abs(F_A(t_0)) ≤ 0.001 kN/m
"Přítlak s rostoucí hloubkou řeky klesá přímo úměrně; průsečík s nulou je hloubka t_0:"
plot(F_A(t), t: 0 m .. 3 m, title: "Přítlak v těsnění podle hloubky t", xlabel: "t", ylabel: "F_A") | kN/m
"Při t_0 ≈ 2,4 m nad kloubem se uzávěr otevře: slaná voda s tíhou uzávěru drží moment řeky jen do této hloubky. Při t = 0 těsnění tlačí asi 11,8 kN/m, při t = 1 m asi 6,9 kN/m."
