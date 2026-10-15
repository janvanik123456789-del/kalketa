# Stlačení krychle hydrostatickým tlakem
"Podle úlohy 2155 Sbírky řešených úloh z fyziky (reseneulohy.cz/2155). Ocelová krychle o hraně 0,1 m je ponořena do vody až na vodorovné dno v hloubce 0,3 m. Modul pružnosti v tahu je 210 GPa. O kolik se zmenší její objem? Obrázek je vlastní."

## Zápis
a := 0.1 m            ' hrana krychle
h := 0.3 m            ' hloubka dna
E := 210 GPa          ' modul pružnosti v tahu
ρ := 1000 kg/m^3      ' hustota vody
g := 9.81 m/s^2       ' tíhové zrychlení
![Krychle na dně v hloubce h: na horní stěnu působí stálý tlak, na boční stěny tlak rostoucí s hloubkou; výška z se měří ode dna](images/krychle.svg){width=80%}

## Rozbor
"Krychle je v rovnováze a smyková napětí se v ní vyruší: působí na ni jen tlak. Na horní stěně je stálý, na bočních stěnách roste lineárně s hloubkou. Krychli proto rozdělíme na malé krychličky, na jejichž stěnách je tlak stálý, a jejich změny objemu sečteme integrálem."

## Řešení
"Hydrostatický tlak na horní stěnu a na boční stěny ve výšce z nad dnem:"
p_s := ρ·g·(h - a) | kPa {eq}
p_v(z) := ρ·g·(h - z) {eq}
"Změna objemu krychličky původního objemu dV_0 podle poměrných deformací ve třech směrech:"
relation dV - dV_0 == (ε_xx + ε_yy + ε_zz)·dV_0 {eq}
"Tlak závisí jen na z, ve směrech x a y je deformace stejná:"
relation ε_yy == ε_xx
derive dV - dV_0 == (2·ε_xx + ε_zz)·dV_0 {eq}
"Podle Hookova zákona, boční stěny tlačí p_v(z), horní a dolní stěna p_s:"
ε_xx(z) := -p_v(z)/E == -ρ·g·(h - z)/E {eq}
ε_zz := -p_s/E == -ρ·g·(h - a)/E {eq}
"Dosazením do (4) poměrná změna objemu krychličky:"
dV_rel(z) := 2·ε_xx(z) + ε_zz == -ρ·g/E·(2·(h - z) + (h - a)) == -ρ·g/E·(3·h - 2·z - a) {eq}
"Celková změna objemu integrálem přes celou krychli:"
ΔV := integral(integral(integral(dV_rel(z), x: 0 m .. a), y: 0 m .. a), z: 0 m .. a) == -ρ·g/E·integral(integral(integral(3·h - 2·z - a, x: 0 m .. a), y: 0 m .. a), z: 0 m .. a) == -ρ·g·a^2/E·(3·h·a - a^2 - a^2) | m^3 {eq}
"Po integraci:"
derive ΔV == -ρ·g·a^3/E·(3·h - 2·a) {eq}
"Záporná změna odpovídá stlačení: objem krychle se zmenší o"
ΔV_abs := abs(ΔV) | mm^3
"Pro představu: poměrná změna objemu celé krychle je"
ΔV_rel := ΔV/a^3
