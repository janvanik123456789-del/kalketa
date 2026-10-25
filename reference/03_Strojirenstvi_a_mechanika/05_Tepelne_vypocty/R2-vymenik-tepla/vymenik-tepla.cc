# Délka výměníku trubka v trubce: protiproud, nebo souproud
"Podle příkladů k předmětu ME302 Heat Transfer (Rose-Hulman Institute of Technology), výměníky tepla, dva řešené příklady. Geotermální voda o teplotě 160 °C ohřívá ve výměníku trubka v trubce užitkovou vodu z 20 °C na 80 °C. Vnitřní trubka je tenkostěnná, průměr 1,5 cm, součinitel prostupu tepla 640 W/(m²·K). Jak dlouhý musí výměník být, když proudí obě kapaliny proti sobě (protiproud), a jak dlouhý, když proudí stejným směrem (souproud)? Obě uspořádání jsou varianty výpočtu. Obrázek je vlastní."
"Zdroj: https://rose-hulman.edu/~adams1/courses/me302/lessons/Examples_HXRs_soln.pdf"

## Zadání
m_c := 1.2 kg/s               ' ohřívaná voda
t_c1 := 20 °C
t_c2 := 80 °C
c_c := 4189 J/(kg·K)
m_h := 2 kg/s                 ' geotermální voda
t_h1 := 160 °C
c_h := 4342 J/(kg·K)
D := 1.5 cm                   ' průměr vnitřní trubky
k := 640 W/(m^2·K)            ' součinitel prostupu tepla
![Výměník trubka v trubce: studená voda ve vnitřní trubce, horká v mezikruží, nahoře proti sobě, dole stejným směrem](images/vymenik.svg){width=85%}

## Tepelná bilance
"Teplo, které přijme ohřívaná voda, odevzdá voda geotermální. Na uspořádání proudů nezáleží:"
Q := m_c·c_c·(t_c2 - t_c1) | kW {eq}
t_h2 := t_h1 - Q/(m_h·c_h) | °C {eq}

## Střední logaritmický teplotní rozdíl
"Uspořádání určuje, s jakou teplotou studené vody se horká voda potká na svém vstupu (konec A) a na výstupu (konec B). V protiproudu se vstupující horká voda potká s už ohřátou studenou, v souproudu se studenou na vstupu:"
table Usporadani: {variants=protiproud}
    | proudeni   | t_cA [°C] | t_cB [°C] |
    | protiproud | 80        | 20        |
    | souproud   | 20        | 80        |
ΔT_A := t_h1 - t_cA | K
ΔT_B := t_h2 - t_cB | K
ΔT_ln := (ΔT_A - ΔT_B)/ln(ΔT_A/ΔT_B) | K {eq}

## Plocha a délka
A := Q/(k·ΔT_ln) | m^2 {eq}
L := A/(π·D) | m {eq}
"Zdroj: protiproud 92 °C, 5,13 m² a 109 m; souproud 83,7 °C, 5,64 m² a 120 m. Zdroj počítá s výstupní teplotou zaokrouhlenou na 125 °C a teplem 302 kW, proto se liší v desetinách."

## Srovnání uspořádání
porovnani := compare(Usporadani, ΔT_ln, A, L)
"Protiproud má větší střední teplotní rozdíl. Stejné teplo proto předá na o 9 % menší ploše a výměník je o 11 m kratší. V protiproudu může studená voda odcházet teplejší, než je horká voda na výstupu; v souproudu nikdy."
