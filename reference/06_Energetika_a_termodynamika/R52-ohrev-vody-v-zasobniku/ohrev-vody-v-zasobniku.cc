# Doba ohřevu vody a doba jejího chladnutí v elektrickém zásobníku
"Vlastní úloha Kalkety: elektrický zásobník ohřívá vodu z vodovodu topným tělesem u dna. Nádoba je obalená vrstvou tepelné izolace, přes kterou uniká teplo do místnosti. Zjistíme, za jak dlouho se voda ohřeje na provozní teplotu, jaký tepelný tok izolací při této teplotě uniká a za jak dlouho voda po vypnutí ohřevu klesne na mezní teplotu. Teorie je ve vrstvě Podklady. Obrázky jsou vlastní."
"Zdroj: vlastní zadání, ověřeno nezávisle v Pythonu (vrstva Kontrola v Pythonu) a v listu energetickou bilancí chladnutí a ohřevem se ztrátami."

## Zadání
V := 120 L                 ' objem vody v zásobníku
ρ := 1000 kg/m^3           ' hustota vody
c := 4186 J/(kg·K)         ' měrná tepelná kapacita vody
P := 2 kW                  ' příkon topného tělesa
η := 0.95                  ' účinnost ohřevu
t_1 := 12 °C               ' teplota vody z vodovodu
t_2 := 60 °C               ' teplota vody po ohřevu
t_o := 20 °C               ' teplota v místnosti
t_c := 50 °C               ' mezní teplota vody po vypnutí ohřevu
δ := 50 mm                 ' tloušťka izolace
λ := 0.025 W/(m·K)         ' tepelná vodivost izolace
A := 2.4 m^2               ' plocha pláště zásobníku
![Řez zásobníkem teplé vody: válcová nádoba s vodou o objemu V a teplotě t_v, obalená vrstvou izolace. U dna je spirála topného tělesa o příkonu P a přívod studené vody, nahoře odběr teplé vody.](images/rez-zasobniku.svg){width=75%}
"Hledáme:"
"a) Za jak dlouho se voda ohřeje z teploty t_1 na teplotu t_2?"
"b) Jaký tepelný tok uniká izolací při teplotě vody t_2? Odpor ocelové stěny a přestupy tepla zanedbáváme."
"c) Za jak dlouho po vypnutí ohřevu klesne teplota vody na mezní teplotu t_c?"

## Doba ohřevu vody (úkol a)
"Hmotnost vody určíme z objemu a hustoty (m = ρ·V):" [T2]
m := ρ·V | kg
"K ohřátí hmoty m o rozdíl teplot je třeba teplo úměrné měrné tepelné kapacitě. Topné těleso dodá za čas τ_o teplo η·P·τ_o (účinnost η říká, že část příkonu se ztratí). Obě tepla se rovnají:" [T2]
relation Q == m·c·(t_2 - t_1) {eq=Qohrev}
relation η·P·τ_o == Q {eq=bilance}
"Během ohřevu zanedbáváme tepelné ztráty izolací, protože jsou proti příkonu tělesa malé. Že je to oprávněné, ukáže posudek a přesnější výpočet níže."
"Potřebné teplo:"
Q := m·c·(t_2 - t_1) | MJ
"Doba ohřevu plyne z bilance, τ_o = Q/(η·P):"
τ_o := Q/(η·P) == m·c·(t_2 - t_1)/(η·P) | min

## Tepelný tok izolací (úkol b)
![Průběh teploty stěnou zásobníku: zleva voda o teplotě t_v, tenká ocelová stěna, silná vrstva izolace tloušťky δ a tenký plášť, vpravo okolí o teplotě t_o. Teplota v izolaci klesá přímočaře, šipka q ukazuje tepelný tok z vody do okolí.](images/teplota-ve-stene.svg){width=75%}
"Tenkou vrstvou izolace vede teplo úměrně rozdílu teplot na jejích stranách a nepřímo úměrně tloušťce. Na velké nádobě lze tenkou vrstvu počítat jako rovinnou:" [T3]
relation Φ == λ/δ·A·(t_v - t_o) {eq=Fourier}
"Odpor ocelové stěny i přestupy tepla (voda → stěna, plášť → místnost) zanedbáváme, takže na izolaci připadá celý rozdíl teplot voda − okolí. Tepelná propustnost vrstvy a vodivost celého pláště:"
U_i := λ/δ | W/(m^2·K)
G := U_i·A | W/K
"Tepelný tok při teplotě vody t_2:"
Φ_2 := λ/δ·A·(t_2 - t_o) == G·(t_2 - t_o) | W
"Podíl tohoto toku na příkonu topného tělesa:"
ratio_ztraty := Φ_2/P | %

## Doba chladnutí po vypnutí ohřevu (úkol c)
"Bez ohřevu ubývá vodě teplo právě tepelným tokem izolací. Za čas dτ klesne teplota vody o dt_v (dt_v je záporné):" [T4]
relation m·c·dt_v == -λ/δ·A·(t_v - t_o)·dτ {eq=difrovn}
"Tok je úměrný rozdílu teplot vody a okolí, takže jde oddělit proměnné: dt_v/(t_v − t_o) = −dτ/T, kde T = m·c/G. Integrací od t_2 při τ = 0 vznikne exponenciální pokles rozdílu teplot s časovou konstantou T:" [T4]
relation T == m·c·δ/(λ·A) {eq=Tkonst}
relation t_v - t_o == (t_2 - t_o)·exp(-τ/T) {eq=expon}
"Časová konstanta je poměr tepelné kapacity vody a vodivosti pláště:"
T := m·c/G == m·c·δ/(λ·A) | h
"Z exponenciály vyjádříme čas, za který teplota klesne z t_2 na t_c, τ_c = T·ln((t_2 − t_o)/(t_c − t_o)):"
τ_c := T·ln((t_2 - t_o)/(t_c - t_o)) | h
"Poměr doby chladnutí k době ohřevu a k časové konstantě:"
poměr_ch := τ_c/τ_o
poměr_T := τ_c/T

## Ohřev se ztrátami (kontrola předpokladu)
"Při ohřevu je teplo z topného tělesa zmenšené o tok izolací, který roste s teplotou vody: m·c·dt_v/dτ = η·P − G·(t_v − t_o). Řešení má stejný tvar jako chladnutí, jen se blíží k rovnovážnému rozdílu η·P/G (voda by ho nikdy nedosáhla, dřív by vypnul termostat):"
Δt_rov := η·P/G | K
t_vz(τ) := t_o + Δt_rov - (t_o + Δt_rov - t_1)·exp(-τ/T)
"Doba ohřevu z t_1 na t_2 se ztrátami:"
τ_oz := T·ln((Δt_rov + t_o - t_1)/(Δt_rov + t_o - t_2)) | min
"O kolik se doba ohřevu prodlouží proti úvaze bez ztrát:"
prodlouzeni := (τ_oz - τ_o)/τ_o | %

## Průběh teploty v čase
![Graf teploty vody v čase. Na začátku teplota během ohřevu přímočaře roste, po vypnutí ohřevu klesá po exponenciále k teplotě okolí t_o. Vodorovná čárkovaná čára vyznačuje mezní teplotu t_c, kde chladnoucí křivka tuto teplotu protne.](images/prubeh-teploty.svg){width=75%}
"Schéma ukazuje oba děje za sebou, časy v něm nejsou v měřítku: ohřev trvá hodiny, chladnutí desítky hodin. Teplota při ohřevu roste přímočaře (stálý příkon, bez ztrát), po vypnutí klesá exponenciálně k teplotě místnosti."
t_v1(τ) := t_1 + η·P/(m·c)·τ
t_v2(τ) := t_o + (t_2 - t_o)·exp(-τ/T)
"Ohřev:"
plot(t_v1(τ), τ: 0 min .. τ_o, hline: t_2, title: "Ohřev vody v zásobníku", xlabel: "τ", ylabel: "t_v") | °C
"Chladnutí po vypnutí, vykreslené do dvojnásobku doby τ_c. Vodorovná čára je mezní teplota, svislá čára čas, kdy ji křivka protne:"
plot(t_v2(τ), τ: 0 h .. 2·τ_c, hline: t_c, vline: τ_c, title: "Chladnutí vody po vypnutí ohřevu", xlabel: "τ", ylabel: "t_v") | °C

## Posudky
"Teplo odevzdané izolací za dobu chladnutí je integrál toku podle času. Musí se rovnat úbytku tepla vody mezi t_2 a t_c:"
Φ_t(τ) := λ/δ·A·(t_v2(τ) - t_o)
Q_chl := integral(Φ_t(τ), τ: 0 h .. τ_c) | MJ
Q_uby := m·c·(t_2 - t_c) | MJ
check "Mezní teplota leží mezi teplotou okolí a teplotou po ohřevu": t_o < t_c and t_c < t_2
check "Teplo z topného tělesa za dobu ohřevu se rovná teplu na ohřev": abs(η·P·τ_o - Q) ≤ 0.000001 MJ
check "Při ohřevu dosáhne teplota hodnoty t_2": abs(t_v1(τ_o) - t_2) ≤ 0.000001 K
check "Ztráty izolací jsou proti příkonu malé (do 5 %)": Φ_2/P ≤ 0.05
check "Ohřev se ztrátami je delší jen o málo (do 2 %)": (τ_oz - τ_o)/τ_o ≤ 0.02
check "Podle exponenciály voda v čase τ_c dosáhne teploty t_c": abs(t_v2(τ_c) - t_c) ≤ 0.000001 K
check "Teplo odevzdané izolací při chladnutí se rovná úbytku tepla vody": abs(Q_chl - Q_uby) ≤ 0.0001 MJ
check "Ohřev se ztrátami dosáhne teploty t_2 v čase τ_oz": abs(t_vz(τ_oz) - t_2) ≤ 0.000001 K
"Voda se ohřeje z teploty t_1 na t_2 za dobu τ_o. Tok Φ_2, který izolace při provozní teplotě propustí, je jen malá část příkonu tělesa, a proto zanedbání ztrát při ohřevu téměř nic nemění, jak ukazuje doba τ_oz. Chladnutí je řádově pomalejší děj než ohřev: časová konstanta T je daná velkou tepelnou kapacitou vody a malou vodivostí izolace, a voda proto klesne na mezní teplotu t_c až za dobu τ_c, což je zlomek časové konstanty."
