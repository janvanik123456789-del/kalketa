# Mostový jeřáb v hale: síly v laně, hlavním nosníku, dráze a sloupu
"Vlastní úloha Kalkety: ocelová hala má mostový jeřáb s kočkou. Břemeno visí na háku kladkostroje, lano se navíjí na buben kočky. Kočka jede po dvou hlavních nosnících mostu, most se koly opírá o dráhové nosníky uložené na konzolách sloupů haly. Tíha břemene tak prochází postupně lanem, hlavním nosníkem, dráhou a sloupem do základů a každá část navazuje na výsledek předchozí. Určíme lano, napětí v hlavním nosníku, zatížení dráhy a bezpečnost sloupu proti vzpěru. Dynamiku, boční síly (brzdění, příčení) a únavu zanedbáváme, kromě dynamického součinitele zdvihu. Obrázky jsou vlastní."
"Zdroj: vlastní zadání; teorie v Podkladech, výpočet ověřen nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Kladkostroj a lano
### Zadání
"Břemeno se zvedá kladkostrojem se čtyřmi nosnými průřezy lana. Lano ze šesti pramenů z ocelových drátů se navíjí na buben. Je třeba určit sílu v laně a nejmenší průměr lana."
g := 9.81 m/s^2           ' tíhové zrychlení
m := 10 t                 ' hmotnost zdvihaného břemene
m_h := 250 kg             ' hmotnost hákového bloku s dolními kladkami
n := 4                    ' počet nosných průřezů lana
η_k := 0.95               ' celková účinnost kladkostroje
R_m := 1770 MPa           ' pevnost drátů lana v tahu
k := 5.5                  ' požadovaná bezpečnost lana
ψ_l := 0.5                ' plnicí součinitel: poměr kovové plochy lana k ploše kruhu o průměru lana
"a) Spočítejte tíhu Q břemene s hákovým blokem."
"b) Jaká síla S působí v laně, které se navíjí na buben? Uvažte počet nosných průřezů a účinnost kladkostroje."
"c) Jaké je dovolené napětí v drátech lana a jaká nejmenší celková kovová plocha A lana z toho plyne?"
"d) Určete nejmenší průměr lana d, když kovová plocha je A = ψ_l·π·d²/4."
![Kladkostroj: nahoře rám kočky se dvěma pevnými kladkami, dole hákový blok se dvěma kladkami a závěsem s břemenem. Modré lano prochází střídavě přes horní a dolní kladky čtyřmi svislými větvemi a pak se navíjí na buben vpravo. Šipka S ukazuje sílu v laně, šipka Q tíhu břemene.](images/kladkostroj.svg){width=75%}

### a) Tíha břemene s hákovým blokem
"Břemeno i hákový blok musí lano nést, proto se jejich hmotnosti sečtou a vynásobí tíhovým zrychlením." [T2]
relation Q == (m + m_h)·g {eq=Q1}
Q := (m + m_h)·g | kN

### b) Síla v laně na bubnu
"Břemeno visí na n nosných větvích lana, tíha se mezi ně rozdělí. Kvůli tření v ložiscích kladek musí lano táhnout o něco víc, protože účinnost η_k je menší než jedna." [T2]
relation S·n·η_k == Q {eq=S1}
derive S == Q/(n·η_k) {eq=S2}
S := Q/(n·η_k) | kN

### c) Dovolené napětí a kovová plocha lana
"Dráty lana se dimenzují na pevnost v tahu. Dělením pevnosti požadovanou bezpečností dostaneme dovolené napětí." [T3]
relation σ_dov == R_m/k {eq}
σ_dov := R_m/k | MPa
"Kovová plocha drátů je síla dělená dovoleným napětím." [T3]
relation A == S/σ_dov {eq}
A := S/σ_dov | mm²

### d) Nejmenší průměr lana
![Průřez ocelovým lanem: šest pramenů okolo střední duše, každý prvek tvoří několik drátů. Kóta d je průměr lana. Popisky označují pramen, drát a kovový průřez A, který tvoří součet ploch drátů.](images/lano.svg){width=75%}
"Kov zabírá jen část plochy kruhu o průměru d, plnicí součinitel ψ_l udává tento poměr." [T3]
relation A == ψ_l·π·d^2/4 {eq}
"Z toho vyjádříme průměr a vyřešíme ho číselně:"
solve d: A == ψ_l·π·d^2/4 in 0 mm .. 100 mm
derive d == sqrt(4·A/(ψ_l·π)) {eq}
σ_l := S/(ψ_l·π·d^2/4) | MPa
check "Průměr lana je kladný": d > 0 mm
check "Lano s tímto průměrem nese sílu S s požadovanou bezpečností": σ_l ≤ σ_dov
"Lano musí mít průměr alespoň d, v praxi se vybere nejbližší větší průměr z řady vyráběných lan. Síla S v laně je jen čtvrtina tíhy, kterou nese kladkostroj, zvětšená o ztráty v kladkách."

## Hlavní nosník mostu
### Zadání
"Hlavní nosník mostu je svařovaný I nosník uložený na koncích volně. Kočka má čtyři kola, na každý ze dvou hlavních nosníků jedou dvě. Zatížení kočky je tíha břemene s hákovým blokem z předchozí části, zvětšená dynamickým součinitelem zdvihu, a k tomu tíha kočky. Počítá se s jedním hlavním nosníkem."
L := 18 m                 ' rozpětí mostu mezi koly
F_Q := Q | kN             ' tíha břemene s hákovým blokem z předchozí části
m_k := 3.2 t              ' hmotnost kočky
ψ_d := 1.2                ' dynamický součinitel zdvihu
a_k := 1.6 m              ' rozchod kol kočky na jednom nosníku
e_k := 1.2 m              ' nejmenší vzdálenost prvního kola kočky od podpory
q_g := 2 kN/m             ' vlastní tíha hlavního nosníku s kolejnicí
f_y := 235 MPa            ' mez kluzu oceli
γ_M := 1.1                ' součinitel spolehlivosti materiálu
h_g := 550 mm             ' výška průřezu nosníku
b_g := 220 mm             ' šířka pásnice
t_g := 18 mm              ' tloušťka pásnice
s_g := 10 mm              ' tloušťka stojiny
"a) Jakou svislou sílu P přenáší jedno kolo kočky? Čtyři kola nesou společně dynamicky zvětšené břemeno a tíhu kočky."
"b) Určete největší ohybový moment hlavního nosníku od kol kočky a od vlastní tíhy. Nejméně příznivá poloha kočky je, když střed nosníku leží uprostřed mezi výslednicí obou kol a kolem blíž ke středu."
"c) Kočka jede nejdál ke kraji. Jaká je největší reakce R_max v podpoře? Použijte ji jako kolový tlak mostu na dráhu."
"d) Spočítejte moment setrvačnosti a průřezový modul průřezu a posuďte nosník na ohyb vůči návrhové pevnosti f_y/γ_M."
![Schéma hlavního nosníku mostu: vodorovný nosník na kloubové podpoře A vlevo a posuvné podpoře B vpravo, po celé délce spojité zatížení q_g. U středu rozpětí stojí kočka se dvěma koly, na každém svislá síla P, rozchod kol je a_k. Kóta L je rozpětí.](images/hlavni-nosnik.svg){width=75%}

### a) Síla v jednom kole kočky
"Kočka má čtyři kola a všechna dohromady nesou dynamicky zvětšené břemeno plus vlastní tíhu kočky, proto se síla dělí čtyřmi." [T4]
relation 4·P == ψ_d·F_Q + m_k·g {eq=P1}
"P odtud vyjádříme a dosadíme:"
derive P == (ψ_d·F_Q + m_k·g)/4 {eq=P2}
P := (ψ_d·F_Q + m_k·g)/4 | kN

### b) Největší ohybový moment
![Diagram ohybového momentu M po délce nosníku mezi podporami A a B, vynesený dolů. Průběh se skládá z úseků rovných čar mezi místy působení dvou sil a z jemně zakřivených úseků, největší hodnota M_max je těsně vedle středu rozpětí. Červené šipky nahoře označují polohy dvou kol kočky.](images/moment.svg){width=75%}
"Největší moment pod silou nastane, když střed rozpětí leží uprostřed mezi výslednicí obou kol a kolem bližším ke středu, to je v poloze x_k prvního kola od podpory A. Přičte se moment od vlastní tíhy nosníku." [T5]
x_k := L/2 - a_k/4 | m
relation M_P == 2·P/L·(L/2 - a_k/4)^2 {eq}
M_P := 2·P/L·(L/2 - a_k/4)^2 | kN·m
"Od spojité vlastní tíhy je největší moment uprostřed rozpětí:" [T5]
relation M_q == q_g·L^2/8 {eq}
M_q := q_g·L^2/8 | kN·m
"Momenty se superpozicí sečtou. Součet dvou největších hodnot, které nastávají v mírně různých místech, je na bezpečné straně." [T5]
relation M == M_P + M_q {eq}
M := M_P + M_q | kN·m
"Kontrola bez předpokladu o poloze: moment pod prvním kolem v poloze x je moment z reakce v podpoře A minus moment spojitého zatížení, a největší hodnotu hledáme přes všechny polohy kočky, které smí nastat. Právě takto je to nakresleno v grafu."
M_kola(x, F, a, l, q) := (F·(2·l - 2·x - a)/l + q·l/2)·x - q·x^2/2
x_ex := maximize(M_kola(x, P, a_k, L, q_g), x: e_k .. L - a_k - e_k)
M_ex := M_kola(x_ex, P, a_k, L, q_g) | kN·m
plot(M_kola(x, P, a_k, L, q_g), x: e_k .. L - a_k - e_k, title: "Moment pod prvním kolem podle jeho polohy", xlabel: "x (první kolo od podpory A)", ylabel: "M") | kN·m
check "Přesný největší moment není větší než součet největších hodnot": M_ex ≤ M
check "Součet největších hodnot se od přesného liší nejvýš o 1 kN·m": M - M_ex ≤ 1 kN·m
check "Přesná poloha prvního kola se od x_k liší o méně než půl metru": abs(x_ex - x_k) < 0.5 m

### c) Největší reakce v podpoře (kočka u kraje)
"Největší reakce nastane, když je kočka co nejblíž podpoře, první kolo je ve vzdálenosti e_k. Reakci každého kola určíme pákou o druhou podporu a přičteme polovinu vlastní tíhy." [T5]
relation R_max == P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 {eq=R1}
R_max := P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 | kN
"Kontrola rovnováhou: reakce v druhé podpoře plus R_max se rovná celé svislé zátěži nosníku."
R_B := P·e_k/L + P·(e_k + a_k)/L + q_g·L/2 | kN
check "Rovnováha svislých sil na nosníku": abs(R_max + R_B - 2·P - q_g·L) ≤ 0.000001 kN

### d) Průřezový modul a posudek na ohyb
![Příčný řez svařovaným I nosníkem. Pásnice nahoře a dole jsou široké a tenké, stojina mezi nimi je úzká. Vyznačeny jsou výška h_g, šířka pásnice b_g, tloušťka pásnice t_g a tloušťka stojiny s_g, červeně čerchovaně osy y a z procházející těžištěm.](images/prurez-nosniku.svg){width=75%}
"Moment setrvačnosti I průřezu vznikne odečtením mezer po stranách stojiny od obdélníku celého průřezu." [T6]
relation I_y == (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 {eq}
I_y := (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 | cm^4
"Průřezový modul je moment setrvačnosti dělený vzdáleností krajního vlákna od osy." [T6]
relation W_y == 2·I_y/h_g {eq}
W_y := 2·I_y/h_g | cm^3
"Návrhová pevnost je mez kluzu dělená součinitelem spolehlivosti." [T6]
relation f_d == f_y/γ_M {eq}
f_d := f_y/γ_M | MPa
"Skutečné napětí za ohybu je moment dělený průřezovým modulem." [T6]
relation σ == M/W_y {eq}
σ := M/W_y | MPa
check "Ohybové napětí v hlavním nosníku": σ ≤ f_d  source "T6"
"Hlavní nosník vyhoví na ohyb. Největší reakce R_max je kolový tlak, který nosník předá dráze."

## Jeřábová dráha
### Zadání
"Most jede po kolejnici na dráhovém nosníku, který je jako prostý nosník uložený na konzolách dvou sousedních sloupů. Koncový vozík mostu má dvě kola a nese konce obou hlavních nosníků, na každé kolo tedy připadá největší reakce R_max jednoho hlavního nosníku z předchozí části. Dráhový nosník se zatěžuje dvěma stejnými silami a vlastní tíhou."
F_k := R_max | kN         ' kolový tlak mostu na dráhu z předchozí části
c := 2.4 m                ' rozchod kol koncového vozíku
l_d := 7.5 m              ' rozpětí dráhového nosníku mezi konzolami
g_d := 1.8 kN/m           ' vlastní tíha dráhového nosníku s kolejnicí
W_d := 1500 cm^3          ' průřezový modul dráhového nosníku
"a) Určete největší ohybový moment dráhového nosníku od dvou kol a od vlastní tíhy. Nejméně příznivá poloha je, když střed nosníku leží uprostřed mezi výslednicí obou kol a kolem blíž ke středu."
"b) Spočítejte největší normálové napětí za ohybu a posuďte dráhový nosník vůči f_y/γ_M."
"c) Jaká je největší reakce R_d na konzolu sloupu? Zatížení je největší, když jedno kolo stojí nad podporou."
![Vodorovný dráhový nosník leží na konzolách dvou svislých sloupů. Na kolejnici nahoře stojí dvě kola s osamělými silami F_k, rozchod kol je c, po celé délce nosníku je spojité zatížení g_d. Zelená šipka R_d je reakce na levou konzolu, kóta l_d je rozpětí mezi sloupy.](images/draha.svg){width=75%}

### a) Největší ohybový moment
"Dvě stejné síly F_k s rozchodem c působí na prostý nosník jako u hlavního nosníku: moment je největší pod jednou silou, když střed rozpětí půlí vzdálenost mezi výslednicí a bližším kolem. Vlastní tíha se přičte." [T7]
relation M_d == 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 {eq}
M_d := 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 | kN·m
"Kontrola stejným postupem jako u hlavního nosníku, hledáním největšího momentu přes všechny polohy vozíku:"
x_dex := maximize(M_kola(x, F_k, c, l_d, g_d), x: 0 m .. l_d - c)
M_dex := M_kola(x_dex, F_k, c, l_d, g_d) | kN·m
check "Přesný největší moment dráhy není větší než součet největších hodnot": M_dex ≤ M_d

### b) Napětí za ohybu
"Napětí je moment dělený průřezovým modulem dráhového nosníku." [T7]
relation σ_d == M_d/W_d {eq}
σ_d := M_d/W_d | MPa
check "Ohybové napětí v dráhovém nosníku": σ_d ≤ f_d  source "T7"

### c) Největší reakce na konzolu
"Jedno kolo stojí nad podporou a přenese se do ní celé, druhé je ve vzdálenosti c a do podpory se přenese podle páky. K tomu přibude polovina vlastní tíhy nosníku." [T7]
relation R_d == F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 {eq}
R_d := F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 | kN
"Kontrola rovnováhou: reakce v druhé podpoře plus R_d se rovná celé zátěži dráhového nosníku."
R_dB := F_k·c/l_d + g_d·l_d/2 | kN
check "Rovnováha svislých sil na dráhovém nosníku": abs(R_d + R_dB - 2·F_k - g_d·l_d) ≤ 0.000001 kN
"Dráhový nosník vyhoví na ohyb. Reakce R_d jde přes konzolu do sloupu."

## Sloup haly pod konzolou dráhy
### Zadání
"Sloup haly je válcovaný I profil, na hlavě kloubově vedený a v patě vetknutý. Při vzpěru ve slabé rovině vybočuje kolem osy z. Svisle ho zatěžuje reakce dráhového nosníku z předchozí části, polovina tíhy dráhového nosníku v sousedním poli a zatížení od střechy. Excentricitu konzoly a boční síly zanedbáváme."
H := 8 m                  ' výška sloupu
N_r := 60 kN              ' svislé zatížení od střechy na hlavě sloupu
μ := 0.7                  ' součinitel vzpěrné délky při vetknutí v patě a vedení hlavy
E_s := 210 GPa            ' modul pružnosti oceli
n_req := 2.5              ' požadovaná jistota vůči Eulerově kritické síle
h_s := 170 mm             ' výška průřezu sloupu
b_s := 180 mm             ' šířka pásnice
t_s := 10 mm              ' tloušťka pásnice
s_s := 6.5 mm             ' tloušťka stojiny
"a) Spočítejte osovou sílu N ve sloupu pod konzolou: reakce R_d z předchozí části, polovina tíhy g_d·l_d sousedního dráhového nosníku a zatížení N_r."
"b) Spočítejte plochu průřezu, moment setrvačnosti k slabé ose z (zaoblení pásnic zanedbejte) a poloměr setrvačnosti."
"c) Určete vzpěrnou délku, štíhlost sloupu a mezní štíhlost π·√(E_s/f_y). Ověřte, že Eulerův vzorec platí."
"d) Spočítejte Eulerovu kritickou sílu N_cr a jistotu n = N_cr/N. Posuďte sloup vůči požadované jistotě n_req a navíc stlačení σ_c = N/A vůči f_y/γ_M."
![Svislý sloup stojí na základu a je v patě vetknutý, nahoře je vedený kloubem a zatížený osovou silou N. Modrá křivka ukazuje vybočený tvar, čárkovaně je původní osa. Vpravo je kótou vyznačena vzpěrná délka L_cr jako vzdálenost od inflexního bodu k hlavě, vlevo celková výška H.](images/sloup.svg){width=75%}

### a) Osová síla ve sloupu
"Osová síla je součet svislých reakcí a zatížení nad průřezem. Reakce R_d už obsahuje polovinu tíhy dráhového nosníku v tomto poli, druhou polovinu přináší sousední pole." [T8]
relation N == R_d + g_d·l_d/2 + N_r {eq}
N := R_d + g_d·l_d/2 + N_r | kN

### b) Průřez sloupu
![Příčný řez válcovaným I profilem sloupu s osami y a z červeně čerchovaně. Vyznačeny jsou výška h_s, šířka pásnice b_s, tloušťka pásnice t_s a tloušťka stojiny s_s. Profil je skoro čtvercový, široké pásnice a tenká stojina.](images/prurez-sloupu.svg){width=75%}
"Plocha je součet dvou pásnic a stojiny mezi nimi." [T8]
relation A_s == 2·b_s·t_s + (h_s - 2·t_s)·s_s {eq}
A_s := 2·b_s·t_s + (h_s - 2·t_s)·s_s | cm^2
"Vzpěr nastane kolem osy s menším momentem setrvačnosti. U tohoto profilu je to osa z, kolem ní má pásnice šířku b_s jako výšku průřezu." [T8]
relation I_z == 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 {eq}
I_z := 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 | cm^4
"Poloměr setrvačnosti je odmocnina z podílu momentu setrvačnosti a plochy." [T8]
relation i_z == sqrt(I_z/A_s) {eq}
i_z := sqrt(I_z/A_s) | mm

### c) Vzpěrná délka a štíhlost
"Vetknutí v patě a kloub vedený na hlavě zkracují vzpěrnou délku proti výšce sloupu na μ-násobek." [T8]
relation L_cr == μ·H {eq}
L_cr := μ·H | m
"Štíhlost je vzpěrná délka dělená poloměrem setrvačnosti. Eulerův vzorec platí, když je větší než mezní štíhlost, při které by Eulerovo kritické napětí dosáhlo meze kluzu." [T8]
relation λ == L_cr/i_z {eq}
λ := L_cr/i_z
relation λ_p == π·sqrt(E_s/f_y) {eq}
λ_p := π·sqrt(E_s/f_y)
check "Eulerův vzorec platí, sloup je štíhlejší než mezní štíhlost": λ > λ_p

### d) Eulerova kritická síla a posudek
"Eulerova kritická síla závisí na tuhosti sloupu a na vzpěrné délce." [T8]
relation N_cr == π^2·E_s·I_z/L_cr^2 {eq}
N_cr := π^2·E_s·I_z/L_cr^2 | kN
"Jistota je podíl kritické síly a skutečné osové síly." [T8]
relation n_s == N_cr/N {eq}
n_s := N_cr/N
σ_c := N/A_s | MPa
σ_cr := N_cr/A_s | MPa
check "Jistota proti vzpěru": n_s ≥ n_req  source "T8"
check "Stlačení průřezu": σ_c ≤ f_d
"Graf ukazuje Eulerovo kritické napětí podle štíhlosti. Sloup leží na větvi hyperboly pod mezí kluzu, tedy ztratí stabilitu dříve, než by se rozdrtil."
σ_E(λ_x) := π^2·E_s/λ_x^2
plot(σ_E(λ_x), f_y + 0·λ_x, λ_x: 60 .. 200, points: [λ, σ_cr], title: "Eulerovo kritické napětí podle štíhlosti", xlabel: "λ", ylabel: "σ") | MPa
"Sloup vyhoví, vzpěr rozhoduje, stlačení nikoliv: osová síla je asi třetina Eulerovy kritické síly a stlačení využívá jen malou část návrhové pevnosti."
