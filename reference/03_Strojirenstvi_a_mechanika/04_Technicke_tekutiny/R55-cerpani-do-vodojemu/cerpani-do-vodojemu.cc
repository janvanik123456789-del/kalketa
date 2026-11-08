# Čerpání vody ze studny do věžového vodojemu: ztráty v potrubí, pracovní bod čerpadla, příkon a plnění nádrže
"Vlastní úloha Kalkety: Obec odebírá vodu ze studny a čerpá ji odstředivým čerpadlem potrubím do věžového vodojemu. Výpočet má čtyři na sebe navazující části: nejdřív potrubí a jeho hydraulické ztráty, potom pracovní bod čerpadla v tomto potrubí, pak příkon motoru s denní spotřebou energie a cenou a nakonec plnění a vyprazdňování vodojemu. Čísla jsou zvolená pro výuku, obrázky jsou vlastní. Teorie je ve vrstvě Podklady."
"Zdroj: vlastní úloha Kalkety, bez vnějšího zdroje."

## Potrubí a hydraulické ztráty
### Zadání
"Ocelové potrubí vede od patního ventilu ve studni svisle k čerpadlu a z čerpadla přes zpětnou klapku a šoupátko do vodojemu. Trasa má čtyři kolena. Čerpadlo má dodávat návrhový průtok."
![Schéma tvaru potrubí bez měřítka: svislé sací potrubí s patním ventilem vede k čerpadlu P, za ním zpětná klapka a šoupátko, pak tlakové potrubí se čtyřmi koleny stoupá k výtoku do nádrže; kóty L_s a L_t, průměr DN 80](images/potrubi-schema.svg){width=75%}
Q_n := 10 L/s          ' návrhový (požadovaný) průtok
d := 80 mm             ' vnitřní průměr potrubí
k := 0.1 mm            ' absolutní drsnost stěny (ocel)
ν := 1.1e-6 m^2/s      ' kinematická viskozita vody
L_s := 6 m             ' délka sacího potrubí
L_t := 95 m            ' délka tlakového potrubí
n_k := 4               ' počet kolen
ζ_k := 0.9             ' ztrátový součinitel jednoho kolena
ζ_p := 3.0             ' ztrátový součinitel patního ventilu
ζ_z := 2.0             ' ztrátový součinitel zpětné klapky
ζ_s := 0.2             ' ztrátový součinitel šoupátka
ζ_v := 1.0             ' ztrátový součinitel výtoku do nádrže
g := 9.81 m/s^2        ' tíhové zrychlení
"a) Spočítejte střední rychlost vody v potrubí a Reynoldsovo číslo při průtoku Q_n."
"b) Určete součinitel tření λ a ztrátu třením po celé délce potrubí."
"c) Určete součet místních ztrát na kolenech, ventilu, klapce, šoupátku a výtoku."
"d) Spočítejte celkovou ztrátovou výšku h_z a z ní součinitel K, pro který platí h_z = K·Q²."

### Rychlost a Reynoldsovo číslo
"Při známém průtoku Q je střední rychlost rozložená rovnoměrně přes celý průřez, proto v = Q/S. [T2]"
S := π·d^2/4 | cm^2          ' průřez potrubí
v := Q_n/S | m/s
![Podélný řez potrubím: rychlostní profil je u stěny nulový a v ose největší (v_max); svislá čárkovaná čára značí střední rychlost v](images/profil-rychlosti.svg){width=75%}
"Reynoldsovo číslo porovnává setrvačné a viskózní síly; nad asi 4000 je proudění turbulentní, což je případ vodovodního potrubí. [T2]"
Re := v·d/ν {decimals=0}
check "Turbulentní proudění": Re ≥ 4000

### Ztráta třením
"Součinitel tření λ závisí na Reynoldsově čísle a relativní drsnosti k/d; pro turbulentní proudění ho dobře udává explicitní vztah Swameeho a Jaina. [T2]"
λ := 0.25/log10(k/(3.7·d) + 5.74/Re^0.9)^2 {decimals=4}
"Pro srovnání Colebrookova rovnice, kterou Kalketa řeší pro λ jako rovnici, a Blasiův vztah pro hladké potrubí (k = 0), který platí jen do Re ≐ 10⁵ a dává dolní mez: drsnost součinitel zvětšuje."
solve λ_C: 1/sqrt(λ_C) == -2·log10(k/(3.7·d) + 2.51/(Re·sqrt(λ_C))) in 0.005 .. 0.1
λ_Bl := 0.3164/Re^(1/4) {decimals=4}
check "Swamee–Jain se od Colebrooka liší o méně než 1 %": abs(λ/λ_C - 1) ≤ 0.01
check "Drsné potrubí má větší λ než hladké": λ > λ_Bl
"Ztráta třením roste s délkou potrubí a je úměrná rychlostní výšce v²/(2g). [T2]"
L := L_s + L_t | m           ' celková délka potrubí
h_f := λ·L/d·v^2/(2·g) | m

### Místní ztráty a celková ztráta
"Lokální překážky (kolena, ventil, klapka, šoupátko, výtok) přidávají místní ztráty; každá je úměrná téže rychlostní výšce a svému součiniteli ζ. [T2]"
Σζ := n_k·ζ_k + ζ_p + ζ_z + ζ_s + ζ_v {decimals=1}
h_l := Σζ·v^2/(2·g) | m
"Celková ztrátová výška je součtem ztráty třením a místních ztrát. [T2]"
h_z := h_f + h_l | m
"Protože všechny ztráty jsou úměrné v², tedy i Q², lze celkovou ztrátu zapsat jako h_z = K·Q²; součinitel K se hodí pro charakteristiku potrubí. [T2]"
K_z := h_z/Q_n^2 | s^2/m^5
check "Při dlouhém potrubí převládá ztráta třením nad místními": h_f > h_l
"Potrubí je dlouhé, takže ztráta třením převládá nad místními ztrátami; z místních překážek nejvíc ubírá patní ventil."

## Čerpadlo: dopravní výška a pracovní bod
### Zadání
"Čerpadlo stojí nad hladinou ve studni. Vodojem stojí na věži a voda se do něj čerpá až po nejvyšší hladinu. Ztrátový součinitel K potrubí je výsledek první části. Z katalogu čerpadla jsou známy dva body jeho charakteristiky."
![Svislý řez soustavou: studna s patním ventilem a sací trubkou k čerpadlu P v domku na terénu, tlakové potrubí k věžovému vodojemu; kóty h_s, h_v, h_max a H_g](images/studna-vodojem.svg){width=75%}
h_s := 3 m             ' výška osy čerpadla nad hladinou ve studni
h_v := 22 m            ' výška dna nádrže vodojemu nad čerpadlem
h_max := 4 m           ' nejvyšší hladina vody nad dnem nádrže
H_0 := 46 m            ' dopravní výška čerpadla při nulovém průtoku
Q_1 := 12 L/s          ' průtok druhého katalogového bodu
H_1 := 36 m            ' dopravní výška čerpadla při průtoku Q_1
Q_min := 9 L/s         ' nejmenší požadovaný průtok čerpadla
"a) Spočítejte geodetickou výšku H_g, kterou musí čerpadlo překonat při plné nádrži."
"b) Z obou katalogových bodů určete koeficient a charakteristiky čerpadla H = H_0 − a·Q²."
"c) Napište charakteristiku potrubí H = H_g + K·Q² s hodnotou K z první části."
"d) Určete pracovní bod: průtok Q_b a dopravní výšku H_b, a ověřte, zda je Q_b větší než Q_min."

### Charakteristiky
"Geodetická výška je celkový výškový rozdíl mezi hladinou ve studni (pod čerpadlem) a nejvyšší hladinou ve vodojemu, který musí čerpadlo překonat. [T3]"
H_g := h_s + h_v + h_max | m
"Charakteristiku odstředivého čerpadla lze v pracovní oblasti aproximovat parabolou H = H_0 − a·Q²; koeficient a určíme z druhého katalogového bodu. [T3]"
a := (H_0 − H_1)/Q_1^2 | s^2/m^5
H_p(Q) := H_0 - a·Q^2 | m
"Potrubí má charakteristiku, která začíná na geodetické výšce a s průtokem roste s druhou mocninou. [T3]"
H_t(Q) := H_g + K_z·Q^2 | m
check "Charakteristika čerpadla prochází druhým katalogovým bodem": abs(H_p(Q_1) - H_1) ≤ 0.001 m

### Pracovní bod
"Pracovní bod je průsečík obou charakteristik, H_p(Q) = H_t(Q). [T3]"
relation H_0 - a·Q^2 == H_g + K_z·Q^2 {eq}
derive Q_b == sqrt((H_0 − H_g)/(a + K_z)) {eq}
Q_b := sqrt((H_0 − H_g)/(a + K_z)) | L/s
"Dosazením pracovního průtoku do kterékoliv charakteristiky dostaneme dopravní výšku v pracovním bodě."
H_b := H_p(Q_b) | m
check "Obě charakteristiky se v pracovním bodě protínají": abs(H_t(Q_b) - H_b) ≤ 0.001 m
check "Průtok větší než minimum": Q_b ≥ Q_min
check "Pracovní bod leží uvnitř katalogového rozsahu (Q_b ≤ Q_1)": Q_b ≤ Q_1
plot(H_p(Q), H_t(Q), Q: 0 L/s .. 16 L/s, points: [Q_b, H_b], title: "Charakteristika čerpadla a potrubí, pracovní bod") | m

### Ověření stálosti K
"Součinitel K jsme určili při návrhovém průtoku Q_n, ale pracovní průtok je jiný a s ním se mírně mění Reynoldsovo číslo i λ. Ztráty při pracovním průtoku proto přepočítáme znovu."
v_b := Q_b/S | m/s
Re_b := v_b·d/ν {decimals=0}
λ_b := 0.25/log10(k/(3.7·d) + 5.74/Re_b^0.9)^2 {decimals=4}
h_zb := (λ_b·L/d + Σζ)·v_b^2/(2·g) | m
K_b := h_zb/Q_b^2 | s^2/m^5
check "Součinitel K se mezi Q_n a Q_b změnil o méně než 1 %": abs(K_b/K_z - 1) ≤ 0.01
"Součinitel K se téměř nemění, proto je pracovní bod určen s dostatečnou přesností."

## Elektromotor: příkon, spotřeba energie a cena
### Zadání
"Čerpadlo pracuje v pracovním bodě z druhé části a pohání ho elektromotor na společné hřídeli. Obec potřebuje denně načerpat zadaný objem vody a platí za odebranou elektrickou energii."
![Elektromotor spojený spojkou s odstředivým čerpadlem P na společné desce; šipky P_el do motoru, P_h na hřídeli, η_m u motoru, směr proudění vody](images/motor-cerpadlo.svg){width=75%}
ρ := 1000 kg/m^3       ' hustota vody
η_č := 0.70            ' účinnost čerpadla v pracovním bodě
η_m := 0.90            ' účinnost elektromotoru
V_d := 100 m^3         ' denně načerpaný objem vody
c_e := 5.5 CZK/kWh     ' cena elektrické energie
"a) Spočítejte hydraulický výkon P_hyd předaný vodě při průtoku Q_b a dopravní výšce H_b."
"b) Určete výkon na hřídeli P_h a elektrický příkon motoru P_el."
"c) Za jak dlouho denně musí čerpadlo běžet, aby načerpalo objem V_d?"
"d) Spočítejte denní spotřebu elektrické energie a její cenu."

### Výkony
"Voda dostane od čerpadla hydraulický výkon, který je součin tíhy dopravené za sekundu a dopravní výšky. [T4]"
P_hyd := ρ·g·Q_b·H_b | kW
"Na hřídeli je třeba větší výkon, protože čerpadlo má ztráty, a z elektrické sítě ještě větší, protože ztráty má i motor. [T4]"
P_h := P_hyd/η_č | kW
P_el := P_h/η_m | kW
![Tok výkonu zleva doprava: široký pás P_el vstupuje do motoru, užší P_h do čerpadla a nejužší P_hyd odchází do vody; ztráty motoru a čerpadla odcházejí jako teplo](images/tok-vykonu.svg){width=75%}
η := η_č·η_m {decimals=2}
check "Celková účinnost souhlasí s poměrem výkonů": abs(P_hyd/P_el - η) ≤ 1e-9

### Doba chodu, energie a cena
"Doba chodu čerpadla je objem dělený průtokem. [T4]"
t_c := V_d/Q_b | h
"Spotřeba elektrické energie je příkon krát doba chodu a cena je spotřeba krát jednotková cena. [T4]"
E_d := P_el·t_c | kWh
N_d := E_d·c_e | CZK
"Energii lze spočítat i z práce potřebné ke zvednutí celého objemu o dopravní výšku, bez průtoku a výkonu:"
E_2 := ρ·g·V_d·H_b/η | kWh
check "Energie z výkonu a z práce souhlasí": abs(E_d - E_2) ≤ 1e-6 kWh
e_m := E_d/V_d | kWh/m^3
"Měrná spotřeba je elektrická energie na metr krychlový načerpané vody; je to hodnota, kterou se čerpací stanice porovnávají mezi sebou."

## Vodojem: doba naplnění a pokles hladiny
### Zadání
"Vodojem je válcová nádrž. Čerpadlo ho plní průtokem Q_b z druhé části, zatímco obec odebírá vodu. Ve večerní špičce čerpadlo neběží a hladina klesá. Nejvyšší hladina h_max je stejná jako v druhé části."
![Řez válcovou nádrží: voda a vzduch, plná čára nejvyšší hladiny, čárkovaná nejnižší hladiny, kóty h_max, h_min a průměr D; přívod z čerpadla a odběr do sítě](images/vodojem-rez.svg){width=75%}
D := 6 m               ' vnitřní průměr nádrže
h_min := 1 m           ' nejnižší dovolená hladina nad dnem
q_p := 1.2 L/s         ' průměrný odběr při plnění
q_v := 4 L/s           ' odběr ve večerní špičce
"a) Spočítejte plochu průřezu nádrže a užitečný objem mezi hladinami h_min a h_max."
"b) Za jak dlouho se nádrž naplní z h_min na h_max, běží-li čerpadlo průtokem Q_b a obec odebírá q_p?"
"c) Za jak dlouho klesne hladina z h_max na h_min při odběru q_v bez čerpání? Jaká je rychlost poklesu hladiny v m/h?"
"d) Kolikrát denně se musí nádrž naplnit, aby stačila na denní objem V_d z třetí části?"

### Užitečný objem
"Plocha průřezu válcové nádrže je S_n = πD²/4 a užitečný objem je součin této plochy a rozdílu nejvyšší a nejnižší hladiny. [T5]"
S_n := π·D^2/4 | m^2
V_u := S_n·(h_max - h_min) | m^3

### Naplnění a vyprázdnění
"Hladina se mění podle rozdílu přítoku a odtoku; je-li přítok větší, hladina stoupá. Při plnění je přítok Q_b a odběr q_p. [T5]"
check "Při plnění hladina stoupá (Q_b > q_p)": Q_b > q_p
t_n := V_u/(Q_b - q_p) | h
"Ve večerní špičce čerpadlo neběží a hladina klesá odběrem q_v. Rychlost poklesu je odběr dělený plochou nádrže. [T5]"
t_v := V_u/q_v | h
w_h := q_v/S_n | m/h
check "Rychlost poklesu a doba vyprázdnění si odpovídají (w_h·t_v = h_max − h_min)": abs(w_h·t_v - (h_max - h_min)) ≤ 1e-9 m
"Hladina během jednoho cyklu, tedy plnění čerpadlem a potom pokles večerním odběrem:"
h_c(t) := if(t ≤ t_n, h_min + (Q_b - q_p)/S_n·t, h_max - q_v/S_n·(t - t_n)) | m
plot(h_c(t), t: 0 h .. t_n + t_v, title: "Hladina ve vodojemu během jednoho cyklu") | m

### Počet plnění za den
"Počet plnění za den je denní spotřeba dělená užitečným objemem nádrže, zaokrouhlený nahoru. [T5]"
n_p := V_d/V_u {decimals=2}
n_pl := ceil(n_p)
check "Nádrž nestačí na denní spotřebu jedním naplněním": V_u < V_d
"Nádrž pojme méně než denní spotřebu, proto se musí plnit víckrát denně; čerpadlo přitom pracuje jen část dne."
