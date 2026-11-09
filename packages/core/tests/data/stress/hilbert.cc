# Hilbertova matice — zátěž numerického jádra
"Hilbertova matice je Klasický zátěžový test numerické lineární algebry: její inverze má přesné celočíselné hodnoty a kondiční číslo roste exponenciálně. List proto ukazuje dvě věci: kde už inverze ztrácí platná místa, a jak roste čas výpočtu. Tabulky jsou naměřené na výpočetním jádru Kalkety (příkazová řádka, totéž jádro jako v okně); oracle pro inverzi je přesný celočíselný vzorec, tedy nezávislá cesta, ne jiný numerický výpočet."

## Zkouška naživo
"Měň posuvníkem rozměr n. Odchylka je největší prvek matice |H·H⁻¹ − I|; pro n = 12 už Kalketa inverzi odmítne a ohlásí singulární matici. To je správné chování — vracet v tu cenu čísla, která se jen tváří jako inverze, by bylo horší."
n := 9 {slider=3..11}
H := matrix(1/(i + j - 1), i: 1 .. n, j: 1 .. n)
Hinv := inverse(H)
D := H·Hinv - identity(n)
odchylka := max(max(D), -min(D))   ' největší odchylka od jednotkové matice
kondice := cond(H)
check "Součin H·H⁻¹ je jednotková matice do miliontiny": odchylka ≤ 1e-6
check "Kondiční číslo má alespoň tři řády": kondice ≥ 500

## Kontrola s přesnými celými čísly
"Pro n = 3 je přesná inverze [9, −36, 30; −36, 192, −180; 30, −180, 180]. Srovnání s celými čísly je nejpřísnější zkouška inverze, jakou lze udělat."
H_3 := matrix(1/(i + j - 1), i: 1 .. 3, j: 1 .. 3)
Hinv_3 := inverse(H_3)
O := [9, -36, 30 | -36, 192, -180 | 30, -180, 180]
rozdil_3 := max(max(Hinv_3 - O), -min(Hinv_3 - O))
check "Inverze 3×3 sedí na přesná celá čísla": rozdil_3 ≤ 1e-9

## Naměřená přesnost
"chyba je největší relativní odchylka prvku inverze proti přesnému celočíselnému vzorci; zkouska je největší odchylka součinu H·H⁻¹ od jednotkové matice. Oboje roste s kondičním číslem; ještě v n = 11 má výsledek tři platná místa, o stupeň výš už inverze padá."
table Presnost:
    | n | kond | chyba | zkouska |
    | 3  | 5.24e2  | 4.38e-15 | 7.11e-15 |
    | 4  | 1.55e4  | 9.74e-14 | 1.14e-13 |
    | 5  | 4.77e5  | 4.24e-13 | 3.64e-12 |
    | 6  | 1.50e7  | 1.08e-10 | 1.46e-10 |
    | 7  | 4.75e8  | 3.91e-9  | 2.79e-9  |
    | 8  | 1.53e10 | 1.42e-8  | 5.96e-8  |
    | 9  | 4.93e11 | 3.67e-6  | 3.81e-6  |
    | 10 | 1.60e13 | 1.22e-4  | 7.63e-5  |
    | 11 | 5.23e14 | 2.98e-3  | 1.71e-3  |
"Mezi kondičním číslem a chybou je přímá úměra — list tedy ztrácí přesnost přesně tak, jak teorie veleí."
check "Kondice mezi desátým a jedenáctým rozměrem ještě roste": Presnost.kond[9] / Presnost.kond[8] > 20
plot(Presnost.chyba, x: Presnost.n, kind: "points", yscale: "log", title: "Chyba inverze podle rozměru")
fit_chyba := fit(Presnost.chyba, x: Presnost.n, kind: "exp")
plot(fit_chyba(x), x: 3 .. 11, yscale: "log", title: "Exponenciální růst chyby")

## Naměřený čas
"Čas je doba samotného výpočtu, odečtená od času téhož listu bez dané operace. Růst je kubický, tedy O(n³), jak odpovídá Gaussově eliminaci — žádný výkonový kolaps ani zamrznutí, i na šedesátém rozměru je to vteřina."
table Cas:
    | n | kondice_ms | vlastni_ms |
    | 5  | 0.060 | 0.004 |
    | 10 | 0.253 | 0.167 |
    | 15 | 0.864 | 0.352 |
    | 20 | 2.196 | 0.838 |
    | 30 | 8.647 | 2.613 |
    | 40 | 22.583 | 5.174 |
    | 60 | 92.164 | 10.959 |
fit_kond := fit(Cas.kondice_ms, x: Cas.n, kind: "power")   ' OČ: exponent kolem 3
fit_vlastni := fit(Cas.vlastni_ms, x: Cas.n, kind: "power")
plot(Cas.kondice_ms, x: Cas.n, kind: "points", title: "Čas kondičního čísla")
plot(fit_kond(x), x: 5 .. 60, title: "Proložená mocninná křivka (kondice)")
plot(fit_vlastni(x), x: 5 .. 60, title: "Proložená mocninná křivka (vlastní čísla)")

## Kde list mlčí
"Dvě věci jsem naměřil a list na ně neupozorní sám: determinant Hilbertovy matice od n = 40 vrací přesnou nulu (podtečení, ne chybu E-NO-RESULT) a kondiční číslo nad n = 60 už neroste — pro n = 60 je 1,2·10²⁰, pro n = 80 menších 1,1·10¹⁹. Obě hodnoty jsou za hranicí double a měly být oznámené."