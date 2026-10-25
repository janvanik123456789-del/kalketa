# Vyhodnocení zkoušky tahem oceli 11 458
"Podle cvičení 4 předmětu Mezní stavy materiálu (VUT v Brně, Ústav materiálových věd a inženýrství, Vlach a kol.), příklad 2. Válcová zkušební tyč ze oceli 11 458 se závitovými hlavami se přetrhla v tahovém stroji. Ze zaznamenaných sil a z rozměrů tyče před zkouškou a po ní určíme smluvní mez kluzu, mez pevnosti, zúžení, tažnost, tahovou houževnatost, resilienci a míru deformačního zpevnění. Zdroj výsledky neuvádí; všechny jsou ověřené samostatně v Pythonu. Obrázek je vlastní."
"Zdroj: https://imse.fme.vutbr.cz/wp-content/themes/umvi_website/assets/materials/winter/6MS/Cviceni/04-Plasticka.pdf"

## Zadání
d_0 := 9.95 mm                ' průměr měrné části tyče
F_p02 := 17.21 kN             ' síla při plastické deformaci 0,2 %
F_m := 25.75 kN               ' největší síla během zkoušky
F_u := 17.39 kN               ' síla v okamžiku lomu
d_u := 5.28 mm                ' průměr tyče v místě lomu
"Po přetržení se poloviny tyče přiložily lomovými plochami k sobě a změřily se dvě vzdálenosti rysek: (1) rysky, mezi kterými leží krček, původně 50 mm od sebe; (2) rysky původně 100 mm od sebe."
L_01 := 50 mm
L_u1 := 68.5 mm
L_02 := 100 mm
L_u2 := 128 mm
"Modul pružnosti oceli zdroj neuvádí; potřebujeme ho jen pro resilienci, volíme obvyklou hodnotu:"
E := 210 GPa
![Zkušební tyč před zkouškou a po přetržení: průměr d_0 a měrná délka L_0, po zkoušce krček o průměru d_u a prodloužená délka L_u](images/tyc.svg){width=80%}

## Pevnostní charakteristiky
S_0 := π·d_0^2/4 | mm^2
R_p02 := F_p02/S_0 | MPa {eq}
R_m := F_m/S_0 | MPa {eq}

## Deformační charakteristiky
"Zúžení z průřezu v místě lomu:"
S_u := π·d_u^2/4 | mm^2
Z := (S_0 - S_u)/S_0 | % {eq}
"Tažnost A_5,65 patří ke krátké poměrné tyči s měrnou délkou L_0 = 5,65·√S_0. Pro tuto tyč to je 50 mm, tedy rysky (1):"
L_0 := 5.65·sqrt(S_0) | mm
A_565 := (L_u1 - L_01)/L_01 | % {eq}
"Rysky (2) vzdálené 100 mm dávají tažnost menší. Prodloužení v krčku je skoro stejné, ale rozpočítá se na dvojnásobnou délku. Proto se u tažnosti vždy uvádí, k jaké měrné délce patří."
A_100 := (L_u2 - L_02)/L_02 | %

## Energie a zpevnění
"Skutečné napětí v okamžiku lomu, vztažené k průřezu krčku:"
σ_u := F_u/S_u | MPa
"Resilience je energie pružné deformace v jednotce objemu do meze kluzu:"
U_r := R_p02^2/(2·E) | MJ/m^3 {eq}
"Tahová houževnatost je plocha pod tahovým diagramem. Přibližně je to průměr meze kluzu a meze pevnosti krát tažnost:"
U_t := (R_p02 + R_m)/2·A_565 | MJ/m^3 {eq}
"Míra deformačního zpevnění je poměr meze pevnosti a meze kluzu:"
n_z := R_m/R_p02
"Ocel 11 458 se zpevňuje asi o polovinu: R_m je 1,5násobek R_p0,2 a lomí se tvárně s výrazným krčkem (zúžení přes 70 %)."
