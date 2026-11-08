# Nabíjení kondenzátoru přes rezistor: časová konstanta, proud, napětí a energie
"Vlastní úloha Kalkety: vybitý kondenzátor se po sepnutí spínače nabíjí ze zdroje stejnosměrného napětí přes rezistor. Napětí na kondenzátoru roste a proud obvodem klesá. Hledáme časovou konstantu, proud v okamžiku sepnutí a v čase t_1, napětí na kondenzátoru v čase t_1, dobu nabití na 90 % napětí zdroje a energii nabitého kondenzátoru. Zdroj je ideální, součástky lineární, spínač sepne bez zákmitů. Teorie je ve vrstvě Podklady. Obrázky jsou vlastní."
"Zdroj: vlastní úloha Kalkety, ověřeno energetickou bilancí (teplo v rezistoru) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
U := 12 V              ' napětí zdroje
R := 4.7 kΩ            ' odpor rezistoru
C := 220 μF            ' kapacita kondenzátoru
t_1 := 1 s             ' čas po sepnutí spínače
![Schéma obvodu: zdroj stejnosměrného napětí U, spínač S, rezistor R a kondenzátor C zapojené v sérii. Šipka i ukazuje směr proudu, šipka u_C napětí na kondenzátoru.](images/schema.svg){width=75%}

## Úkol
"a) Spočítejte časovou konstantu obvodu."
"b) Jaký proud teče obvodem v okamžiku sepnutí a jaký v čase t_1?"
"c) Jaké je napětí na kondenzátoru v čase t_1?"
"d) Za jak dlouho se kondenzátor nabije na 90 % napětí zdroje a jakou energii má po úplném nabití?"

## Časová konstanta (část a)
"Po sepnutí spínače se napětí zdroje rozdělí mezi rezistor a kondenzátor (druhý Kirchhoffův zákon) [T2]."
relation U == R·i + u_C  {eq=Kirs}
"Proud nabíjí kondenzátor, a proto je úměrný rychlosti, s jakou roste jeho napětí [T2]."
relation i == C·du_C/dt  {eq=Proud}
"Dosadíme proud do napěťové rovnice a dostaneme jedinou rovnici pro průběh napětí. Součin R·C stojí u derivace a určuje rychlost děje [T2]."
derive R·C·du_C/dt + u_C == U
"Řešením této rovnice je exponenciála a její časové měřítko je právě součin R·C [T3]."
relation τ == R·C  {eq=Tau}
τ := R·C | s {decimals=3}
"Za jednu časovou konstantu napětí dosáhne tohoto podílu konečné hodnoty. Za pět časových konstant je děj prakticky ukončený, zbývá podíl uvedený níže [T3]."
q_1 := 1 - exp(-1) | % {decimals=1}
q_5 := exp(-5) | % {decimals=2}

## Proud v okamžiku sepnutí a v čase t_1 (část b)
"Vybitý kondenzátor má na začátku nulové napětí. V tu chvíli se chová jako zkrat a celé napětí zdroje se objeví na rezistoru. Proud je proto na začátku největší, omezený jen rezistorem [T3]."
I_0 := U/R | mA {decimals=3}
"Proud pak klesá po exponenciále s časovou konstantou τ [T3]."
relation i(t) == U/R·exp(-t/τ)  {eq=ProudT}
![Graf proudu obvodem v čase po sepnutí spínače. Proud začíná na hodnotě U/R a klesá po exponenciále k nule; v čase jedné časové konstanty τ je na 37 % počáteční hodnoty. Na vodorovné ose jsou vyznačeny násobky τ.](images/proud.svg){width=75%}
"V čase t_1 dosadíme do exponentu poměr t_1/τ; jeho hodnota k_1 říká, jaká část počátečního proudu ještě teče."
k_1 := exp(-t_1/τ)
i_t1 := U/R·exp(-t_1/τ) | mA {decimals=3}
plot(U/R·exp(-x/τ), x: 0 s .. 5·τ, title: "Proud obvodem po sepnutí", ylim: 0 mA .. 3 mA, points: [t_1, i_t1]) | mA
"Čas t_1 je o málo kratší než jedna časová konstanta, proto proud klesl jen na něco přes tři pětiny počáteční hodnoty."
check "V čase t_1 je čas ještě před jednou časovou konstantou": t_1 ≤ τ
check "Proud na začátku je největší": i_t1 ≤ I_0

## Napětí na kondenzátoru v čase t_1 (část c)
"Kondenzátor se nabíjí z nuly a jeho napětí se blíží napětí zdroje. Roste po stejné exponenciále, jakou proud klesá, oba děje mají stejné časové měřítko τ [T3]."
relation u_C(t) == U·(1 - exp(-t/τ))  {eq=UCt}
![Graf napětí na kondenzátoru u_C v čase po sepnutí spínače. Napětí roste od nuly po exponenciále k napětí zdroje U; v čase jedné časové konstanty τ dosáhne 63 % U. Na vodorovné ose jsou vyznačeny násobky τ.](images/napeti.svg){width=75%}
"V okamžiku sepnutí je kondenzátor vybitý. Jeho napětí začíná na nule a může dorůst nejvýše k napětí zdroje, nikdy ho nepřekročí [T3]."
relation u_C(0) == 0 V  {eq=UC0}
"V čase t_1 stojí v exponentu stejný činitel k_1 jako u proudu."
u_C_t1 := U·(1 - k_1) | V {decimals=3}
"Na rezistoru zbývá doplněk do napětí zdroje."
u_R_t1 := U - u_C_t1 | V {decimals=3}
podil_t1 := u_C_t1/U | % {decimals=1}
plot(U·(1 - exp(-x/τ)), x: 0 s .. 5·τ, title: "Napětí na kondenzátoru po sepnutí", ylim: 0 V .. 12 V, points: [t_1, u_C_t1]) | V
"V čase t_1 má kondenzátor o málo méně než dvě třetiny napětí zdroje, tedy o něco méně, než by měl po celé časové konstantě. Zbytek napětí drží rezistor, a proto ještě teče proud, který kondenzátor dál nabíjí."
check "Napětí na kondenzátoru je pod napětím zdroje": u_C_t1 ≤ U
check "Napětí na kondenzátoru v čase t_1 je pod hodnotou po jedné časové konstantě": u_C_t1 ≤ U·(1 - exp(-1))
check "Druhý Kirchhoffův zákon v čase t_1": abs(R·i_t1 + u_C_t1 - U) ≤ 1e-9 V

## Nabití na 90 % a energie (část d)
"Napětí na kondenzátoru roste po exponenciále. Dobu, za kterou dosáhne podílu k napětí zdroje, dostaneme obrácením této exponenciály [T3]."
relation t == -τ·ln(1 - k)  {eq=Doba}
"Požadujeme devět desetin napětí zdroje, proto dosadíme k_90."
k_90 := 0.9
t_90 := -τ·ln(1 - k_90) | s {decimals=3}
n_90 := t_90/τ
"Doba nabití na 90 % je násobkem časové konstanty daným jen číslem k, ne hodnotami součástek. Je to víc než dvě časové konstanty, ale méně než pět."
check "Do pěti časových konstant": t_90 ≤ 5·τ
check "Zpětné dosazení: v čase t_90 je napětí devět desetin napětí zdroje": abs(U·(1 - exp(-t_90/τ)) - k_90·U) ≤ 1e-9 V
"Nabitý kondenzátor uchovává energii v elektrickém poli; její velikost určíme z kapacity a napětí zdroje [T4]."
relation W == C·U^2/2  {eq=Energie}
W := C·U^2/2 | mJ {decimals=2}
"Kontrola jinou cestou: teplo v rezistoru spočítáme jako integrál ztrátového výkonu R·i² přes celé nabíjení. Horní mez 20·τ je prakticky nekonečno."
Q_R := integral(R·(U/R·exp(-t/τ))^2, t: 0 s .. 20·τ) | mJ {decimals=2}
check "Teplo v rezistoru se rovná energii kondenzátoru": abs(Q_R - W) ≤ 1e-6·W
"Zdroj o napětí U dodá při nabití náboj C·U, tedy energii C·U², což je dvojnásobek energie kondenzátoru. Polovina se uloží v kondenzátoru, druhá polovina se v rezistoru změní na teplo, a to nezávisle na jeho odporu."
W_zdroj := C·U·U | mJ {decimals=2}
check "Zdroj dodal energii kondenzátoru a rezistoru": abs(W_zdroj - W - Q_R) ≤ 1e-6·W
plot(U·(1 - exp(-x/τ)), x: 0 s .. 5·τ, title: "Nabíjení na 90 % napětí zdroje", ylim: 0 V .. 12 V, points: [t_90, k_90·U]) | V
"K devadesáti procentům napětí zdroje kondenzátor doroste za dobu delší než dvě časové konstanty, ale kratší než pět. Po úplném nabití je v kondenzátoru uložena energie W; stejně velká energie se při nabíjení změnila na teplo v rezistoru."
