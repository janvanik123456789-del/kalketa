# Návrh síťového napájecího zdroje 24 V pro LED osvětlení
"Vlastní úloha Kalkety: z elektrické sítě 230 V se má napájet LED osvětlení ze stejnosměrného zdroje 24 V. Zdroj tvoří transformátor, můstkový usměrňovač a filtrační kondenzátor; LED jsou zapojeny v několika paralelních řetězcích s předřadnými odpory. Části na sebe navazují: výsledky každé z nich vstupují do další. Předpokládáme sinusové napětí sítě, ideální diody s konstantním úbytkem, zátěž odebírající stálý proud a lineární pokles napětí na kondenzátoru mezi špičkami. Obrázky jsou vlastní. Teorie je ve vrstvě Podklady."
"Zdroj: vlastní úloha Kalkety, bez vnějšího zdroje; ověřeno nezávisle v Pythonu (vrstva Kontrola v Pythonu) a v každé části bilancí výkonů, napětí nebo teplot."

## LED zátěž
![](images/zatez-led.svg){width=75% alt="Schéma zapojení LED: dvě vodorovné přípojnice, horní +U_dc a dolní 0 V, mezi nimi zdroj vlevo a několik svislých větví vedle sebe. Každá větev má nahoře rezistor R_s a pod ním sérii N_s diod LED s napětím U_f, protéká jí proud I_s. Mezi druhou a třetí větví jsou tři tečky, nad větvemi je popis n_s paralelních řetězců."}
### Zadání
"Osvětlení tvoří několik stejných řetězců LED zapojených paralelně. Každý řetězec má vlastní předřadný odpor, který při napětí zdroje nastaví jmenovitý proud LED."
N_s := 7              ' počet LED v jednom řetězci
U_f := 3.0 V          ' propustné napětí jedné LED při jmenovitém proudu
I_s := 0.2 A          ' jmenovitý proud jednoho řetězce
n_s := 8              ' počet paralelních řetězců
U_dc := 24 V          ' požadované stejnosměrné napětí zdroje
"a) Spočítejte napětí jednoho řetězce LED a celkový proud zátěže."
"b) Jak velký předřadný odpor musí být v každém řetězci a jaký výkon se na něm maří?"
"c) Spočítejte výkon všech LED, celkový výkon na výstupu zdroje a výkon, který se maří na všech odporech dohromady."
### Napětí řetězce a celkový proud (a)
"LED se chová jako dioda s téměř stálým propustným napětím, proud ale na napětí roste velmi strmě. Proto se LED napájí proudem a každý řetězec dostane předřadný odpor, který zbytek napětí zdroje převezme a nastaví proud." [T2]
"V jednom řetězci jsou LED v sérii, takže se jejich propustná napětí sčítají. Stejnosměrné napětí zdroje stojí na celé větvi (odpor i řetězec), ale napětí samotného řetězce je jen součet napětí LED." [T2]
relation U_s == N_s·U_f {eq=Retezec}
U_s := N_s·U_f | V
"Paralelní větve mají stejné napětí, ale každá odebírá svůj proud ze zdroje – celkový proud je součtem proudů všech řetězců." [T2]
relation I == n_s·I_s {eq=Proud}
I := n_s·I_s | A
### Předřadný odpor a jeho ztráta (b)
"Na předřadném odporu zbývá napětí zdroje minus napětí řetězce; odporem teče proud řetězce, takže z Ohmova zákona vychází jeho velikost." [T2]
relation R_s == (U_dc - U_s)/I_s {eq=Odpor}
R_s := (U_dc - U_s)/I_s | Ω
"Výkon mařený na odporu je úměrný druhé mocnině proudu řetězce – jde o cenu za stabilitu proudu." [T2]
relation P_R == I_s²·R_s {eq=Ztrata}
P_R := I_s²·R_s | W
check "Zdroj stačí na celý řetězec (na odporu zbývá kladné napětí)": U_dc > U_s
### Výkony LED, výstupu a všech odporů (c)
"Výkon jedné LED je její napětí krát proud; výkon řetězce se počítá jako napětí řetězce krát proud."
P_LED1 := U_f·I_s | W
P_Ret := U_s·I_s | W
"Výkon všech LED je výkon jednoho řetězce krát počet větví (stejně jako N_s·n_s diod o výkonu jedné LED)." [T2]
P_LED := P_Ret·n_s | W
"Celkový výkon na výstupu zdroje je napětí zdroje krát celkový proud." [T2]
relation P_out == U_dc·I {eq=Vystup}
P_out := U_dc·I | W
"Výkon na všech odporech dohromady je ztráta jednoho odporu krát počet větví."
P_Rs := n_s·P_R | W
"Zkontrolujeme, že se výkon na výstupu rovná součtu výkonů LED a odporů (zákon zachování energie)."
check "Bilance výkonu": abs(P_out - P_LED - P_Rs) ≤ 0.000001 W
check "Výkon jedné LED krát jejich počet dá výkon všech LED": abs(N_s·n_s·P_LED1 - P_LED) ≤ 0.000001 W
"Poměr výkonu LED k výkonu na výstupu ukazuje, jak účinné je předřazení odporů (bez transformátoru a diod)."
η_out := P_LED/P_out
"Graf ukazuje, proč se do řetězce dává co nejvíc LED: čím blíž je napětí řetězce napětí zdroje, tím méně výkonu zmaří odpory. Při osmi LED by na odporu nezbylo žádné napětí a proud by nic nehlídalo, proto je sedm LED největší rozumný počet."
η_N(N_x) := N_x·U_f/U_dc
plot(η_N(N_x), N_x: 1 .. 7, points: [N_s, η_out], title: "Účinnost předřazení odporů podle počtu LED v řetězci", xlabel: "N_s", ylabel: "η_out")
"Řetězec s největším možným počtem LED využije většinu napětí zdroje; zbytek se v odporech mění v teplo a je to cena za stálý proud."

## Transformátor
![](images/transformator.svg){width=75% alt="Schéma transformátoru se železným jádrem s oknem uprostřed. Na levém sloupku je modré primární vinutí s napětím U_1 a proudem I_1, na pravém červené sekundární vinutí s napětím U_2 a proudem I_2. Zelená přerušovaná smyčka Φ vyznačuje magnetický tok jádrem, pod obrázkem je popis počtu závitů N_1 a N_2."}
### Zadání
"Zdroj z předchozí části má dodávat napětí U_dc a proud I. Transformátor z rozvodu 230 V / 50 Hz musí na sekundární straně dát takové střídavé napětí, aby z něj můstek s filtračním kondenzátorem vyrobil stejnosměrných 24 V. Střední napětí na kondenzátoru je o polovinu zvlnění pod jeho špičkou a na dvou vodivých diodách můstku vždy vznikne úbytek."
U_z := U_dc           ' stejnosměrné napětí zátěže (z první části)
I_z := I              ' stejnosměrný proud zátěže (z první části)
U_1 := 230 V          ' primární napětí ze sítě
f := 50 Hz            ' kmitočet sítě
U_F := 0.9 V          ' úbytek napětí na jedné vodivé diodě
ΔU_max := 1.5 V       ' dovolený rozkmit zvlnění na kondenzátoru
d_u := 0.06           ' relativní pokles sekundárního napětí při zatížení proti stavu naprázdno
k_I := 1.8            ' poměr efektivního proudu sekundáru ke stejnosměrnému proudu zátěže
B_m := 1.2 T          ' největší magnetická indukce v jádru
A_Fe := 9 cm^2        ' průřez železa ve sloupku jádra
"a) Jaké špičkové napětí musí mít sekundární vinutí, aby střední napětí na kondenzátoru bylo U_z při zvlnění ΔU_max?"
"b) Určete efektivní sekundární napětí pod zatížením, napětí naprázdno a převod transformátoru."
"c) Spočítejte efektivní proud sekundáru, zdánlivý výkon transformátoru a primární proud."
"d) Kolik závitů musí mít primární a sekundární vinutí při daném jádru? Použijte rovnici U = 4,44·f·N·B_m·A_Fe."
"Transformátor přenáší výkon střídavým magnetickým tokem v jádru; napětí vinutí je úměrné počtu závitů. Sekundár musí dát dostatečnou špičku, aby kondenzátor po usměrnění dosáhl požadovaného stejnosměrného napětí." [T3]
### Špičkové napětí sekundárního vinutí (a)
"Kondenzátor se dobíjí na špičku usměrněného napětí, ale zátěž z něj bere proud i mezi špičkami, takže jeho střední napětí leží o polovinu rozkmitu pod špičkou. V každé půlvlně navíc vedou dvě diody můstku, které uberou dva úbytky. Špička sekundáru tedy musí pokrýt U_z, polovinu zvlnění a oba úbytky. Zvlnění zde bereme na jeho dovolené mezi ΔU_max, takže střední napětí na kondenzátoru vyjde právě U_z." [T3]
relation U_2m == U_z + ΔU_max/2 + 2·U_F {eq=Spicka}
U_2m := U_z + ΔU_max/2 + 2·U_F | V
### Efektivní napětí pod zatížením, napětí naprázdno a převod (b)
"Sinusové napětí má efektivní hodnotu menší než špičkovou, a to o odmocninu ze dvou. Pod zátěží napětí vinutí klesne oproti stavu naprázdno; napětí naprázdno je proto vyšší. Převod je poměr primárního napětí k napětí naprázdno, protože to odpovídá poměru počtů závitů." [T3]
relation U_2 == U_2m/sqrt(2) {eq=Efektivni}
U_2 := U_2m/sqrt(2) | V
relation U_20 == U_2/(1 - d_u) {eq=Naprazdno}
U_20 := U_2/(1 - d_u) | V
relation n == U_1/U_20 {eq=Prevod}
n := U_1/U_20
### Proudy a zdánlivý výkon (c)
"Kondenzátor odebírá proud jen v krátkých špičkách, proto je efektivní proud vinutí větší než stejnosměrný proud zátěže o činitel k_I. Zdánlivý výkon transformátoru je součin efektivního napětí a proudu sekundáru; primární proud vychází ze stejného zdánlivého výkonu při napětí sítě (magnetizační proud a ztráty zanedbáváme)." [T3]
relation I_2 == k_I·I_z {eq=Proud2}
I_2 := k_I·I_z | A
relation S == U_2·I_2 {eq=VykonS}
S := U_2·I_2 | VA
relation I_1 == S/U_1 {eq=Proud1}
I_1 := S/U_1 | A
### Počty závitů obou vinutí (d)
![](images/jadro.svg){width=75% alt="Řez sloupkem transformátorového jádra: uprostřed šedý obdélník složený z vodorovných tenkých plechů o rozměrech a a b, uvnitř značka A_Fe. Kolem něj je žlutá cívka s oranžovými kroužky, které představují měděné vodiče vinutí v řezu."}
"Rovnice U = 4,44·f·N·B_m·A_Fe dává počet závitů z velikosti jádra; B_m je největší přípustná indukce, aby plechy nesytily. Závity počítáme pro napětí naprázdno, které odpovídá napětí na svorkách bez zátěže. Počet závitů je bez jednotky." [T3]
relation U == 4.44·f·N·B_m·A_Fe {eq=Zavity}
"Vinutí má jen celé závity. Zaokrouhlujeme nahoru: víc závitů při stejném napětí znamená menší indukci, takže jádro nepřekročí B_m. Pro sekundár dosadíme napětí naprázdno U_20:"
N_2 := ceil(U_20/(4.44·f·B_m·A_Fe))        ' počet závitů sekundáru
"Primární vinutí je připojené na síťové napětí U_1:"
N_1 := ceil(U_1/(4.44·f·B_m·A_Fe))         ' počet závitů primáru
### Kontrola závitů
"Indukce v jádru při zaokrouhleném počtu závitů musí zůstat pod B_m, a to u obou vinutí."
B_2 := U_20/(4.44·f·N_2·A_Fe) | T
B_1 := U_1/(4.44·f·N_1·A_Fe) | T
check "Indukce v jádru podle sekundáru nepřekročí B_m": B_2 ≤ B_m
check "Indukce v jádru podle primáru nepřekročí B_m": B_1 ≤ B_m
"Počty závitů musí sedět s převodem – podíl N_1/N_2 se má rovnat převodu n (poměr závitů je poměr napětí). Každé vinutí jsme zaokrouhlili nahoru o méně než jeden závit, takže poměr se může od převodu odchýlit nejvýš o jeden závit sekundáru z jeho celkového počtu, tedy o 1/N_2. To je rozumná hranice: přesnější převod než na celý závit sekundáru vinutí nedovolí."
tol_N := 1/N_2
check "Převod odpovídá počtům závitů (odchylka nejvýš o jeden závit sekundáru)": abs(N_1/N_2 - n)/n ≤ tol_N
"Transformátor musí na sekundáru dát napětí, které vyrobí U_z na kondenzátoru; velikost jádra a napětí pak určují počty závitů, a zdánlivý výkon S je mírou velikosti transformátoru, ne watty zátěže."

## Usměrňovač a filtrační kondenzátor
![](images/usmernovac.svg){width=75% alt="Schéma můstkového usměrňovače se čtyřmi diodami D1 až D4 uspořádanými do kosočtverce. Uvnitř je zdroj střídavého napětí u_2 mezi uzly A a B, z horního uzlu označeného plus vede proud i_d přes zátěž R_z k dolnímu uzlu označenému minus. Šipka u_d u zátěže ukazuje výstupní napětí."}
### Zadání
"Sekundární napětí U_2 z předchozí části se usměrní Graetzovým můstkem a vyhladí kondenzátorem. Zátěž odebírá proud I_z z první části. Kmitočet sítě, úbytek na diodě a dovolené zvlnění jsou stejné jako v předchozí části. Návrh transformátoru počítal střední napětí na kondenzátoru, proto stejné měřítko použijeme i při posouzení."
C_v := 15000 μF       ' zvolený filtrační kondenzátor
k_u := 2              ' rezerva závěrného napětí diod
k_c := 1.25           ' rezerva jmenovitého napětí kondenzátoru
"a) Jaké je špičkové napětí na kondenzátoru po usměrnění sekundárního napětí U_2?"
"b) Jaká je nejmenší kapacita kondenzátoru, při které rozkmit zvlnění nepřekročí ΔU_max? Použijte vztah ΔU = I_z/(2·f·C)."
"c) Jaký je rozkmit zvlnění se zvoleným kondenzátorem C_v, nejnižší a střední napětí na kondenzátoru? Dostane zátěž 24 V?"
"d) Jaký střední proud teče každou diodou, jaké nejmenší závěrné napětí diod zvolíte s rezervou k_u a jaké nejmenší jmenovité napětí kondenzátoru s rezervou k_c?"
![](images/usmernene-napeti.svg){width=75% alt="Graf časového průběhu napětí u_d po dvoucestném usměrnění: tři oblouky sinusovky nad vodorovnou osou t, každý trvá T/2 a dosahuje špičky U_m. Čárkovaná červená vodorovná čára značená U_stř ukazuje střední hodnotu, která leží níže než špička. Mezi oblouky napětí klesá až k nule."}
"Graetzův můstek propouští proud oběma půlvlnami stejným směrem; v každé půlvlně vedou dvě diody v sérii se zátěží, proto se špička zmenší o dva úbytky." [T4]
### Špičkové napětí na kondenzátoru (a)
"Kondenzátor se dobíjí na vrchol usměrněného napětí. To má špičku √2·U_2, ze které ještě ubudou dva úbytky vodivých diod." [T4]
relation U_m == sqrt(2)·U_2 - 2·U_F {eq=SipkaC}
U_m := sqrt(2)·U_2 - 2·U_F | V
### Nejmenší kapacita pro dovolené zvlnění (b)
![](images/zvlneni.svg){width=75% alt="Graf napětí u_C na kondenzátoru v čase: modrá křivka vždy rychle vystoupí k hodnotě U_m a pak pomalu klesá k hodnotě U_min, než ji znovu dobije další oblouk usměrněného napětí. Slabě čárkované oblouky ukazují usměrněné napětí bez kondenzátoru. Červená oboustranná šipka ΔU u pravého okraje značí rozkmit mezi U_m a U_min."}
"Mezi špičkami se kondenzátor vybíjí do zátěže téměř stálým proudem, proto napětí klesá přibližně lineárně. Rozkmit je úměrný proudu a nepřímo úměrný kapacitě a kmitočtu usměrněného napětí, který je dvojnásobkem sítě." [T4]
relation ΔU == I_z/(2·f·C) {eq=Zvlneni}
"Z podmínky, že rozkmit nesmí překročit ΔU_max, vychází nejmenší kapacita:"
solve C_min: ΔU_max == I_z/(2·f·C_min) | μF
### Zvlnění se zvoleným kondenzátorem a napětí na něm (c)
"Se zvoleným C_v dopočítáme skutečný rozkmit zvlnění." [T4]
ΔU_v := I_z/(2·f·C_v) | V
"Nejnižší napětí je špička zmenšená o celý rozkmit; střední leží v polovině rozkmitu pod špičkou." [T4]
relation U_min == U_m - ΔU {eq=Umin}
U_min := U_m - ΔU_v | V
relation U_str == U_m - ΔU/2 {eq=Ustr}
U_str := U_m - ΔU_v/2 | V
"Co znamená „zátěž dostane U_z“: transformátor jsme v předchozí části navrhli na střední napětí na kondenzátoru, proto stejně posuzujeme i výsledek – rozhoduje střední napětí U_str. Nejnižší napětí U_min, těsně před dobitím, uvádíme jen jako informaci o hloubce zvlnění: krátce může ležet pod U_z. Kdyby zátěž vyžadovala U_z i v nejnižším bodě, musel by se zvětšit kondenzátor (viz graf)."
check "Střední napětí na kondenzátoru je aspoň U_z": U_str ≥ U_z
"Rozdíl U_min − U_z je záporný, když nejnižší napětí leží pod U_z; zde jde o informaci, ne o posudek."
Δ_min := U_min - U_z | V
check "Zvolený kondenzátor není menší než nejmenší kapacita": C_v ≥ C_min
check "Zvlnění se zvoleným kondenzátorem nepřekročí ΔU_max": ΔU_v ≤ ΔU_max
"Graf ukazuje, jak se střední a nejnižší napětí mění s kapacitou a kde se protnou s U_z: střední napětí stačí už od kapacity blízké nejmenší, nejnižší napětí by vyžadovalo kapacitu větší."
U_str_C(C_x) := U_m - I_z/(2·f·C_x)/2 | V
U_min_C(C_x) := U_m - I_z/(2·f·C_x) | V
plot(U_str_C(C_x), U_min_C(C_x), U_z, C_x: 8000 μF .. 30000 μF, title: "Střední a nejnižší napětí na kondenzátoru podle kapacity", xlabel: "C", ylabel: "U") | V
### Proud diodou, závěrná napětí diody a kondenzátoru (d)
"Diodami teče střední proud poloviční proti zátěži, protože se v proudu střídají dvojice diod." [T4]
relation I_D == I_z/2 {eq=ID}
I_D := I_z/2 | A
"Závěrné napětí diody je asi špičkové napětí a součástky se vybírají s rezervou na kolísání sítě." [T4]
relation U_RRM == k_u·U_m {eq=RRM}
U_RRM := k_u·U_m | V
relation U_C == k_c·U_m {eq=UC}
U_C := k_c·U_m | V
"Kondenzátor se dobije na špičku a mezi špičkami se vybíjí do zátěže; zvlnění vychází menší, než kolik dovolujeme, a diody i kondenzátor se volí s rezervou nad špičkou."

## Ztráty a oteplení
![](images/tok-vykonu.svg){width=75% alt="Blokový diagram toku výkonu: zleva síť, transformátor, usměrňovač s kondenzátorem, předřadné odpory R_s a řetězce LED, spojené modrými šipkami s popisy P_in, P_out a P_LED. Z bloků transformátor, usměrňovač a odpory vedou dolů červené šipky ztrát P_Fe + P_Cu, P_D a P_Rs. Vpravo je vzorec účinnosti η = P_LED / P_in."}
### Zadání
"Zdroj z předchozích částí má ztráty na odporech, na diodách můstku a v transformátoru. Diody sedí v jednom pouzdře přišroubovaném na hliníkový chladič ve skříňce, kde je teplejší vzduch. Proud, úbytek na diodě a výstupní výkon jsou z předchozích částí; výkony P_out, P_LED a P_Rs přebíráme z první části, znovu je nedefinujeme."
P_Fe := 1.5 W         ' ztráty v železe transformátoru
P_Cu := 3.2 W         ' ztráty ve vinutí transformátoru
T_a := 50 °C          ' teplota vzduchu ve skříňce
T_jmax := 100 °C      ' nejvyšší dovolená provozní teplota čipu s rezervou
R_jc := 3 K/W         ' tepelný odpor mezi čipem a pouzdrem usměrňovače
R_cs := 0.5 K/W       ' tepelný odpor mezi pouzdrem a chladičem (pasta)
R_sa := 12 K/W        ' tepelný odpor zvoleného chladiče do okolí
"a) Spočítejte ztrátový výkon diod můstku (vždy vedou dvě diody) a příkon zdroje ze sítě jako součet výstupního výkonu a ztrát transformátoru a diod."
"b) Jaká je celková účinnost zdroje jako poměr výkonu LED a příkonu?"
"c) Jaký největší tepelný odpor chladiče smí být, aby teplota čipu nepřekročila T_jmax?"
"d) Jaká bude teplota pouzdra a čipu se zvoleným chladičem a vyhovuje?"
"Výkon ze sítě se cestou k LED zčásti mění v teplo: v železe a vinutí transformátoru, na diodách můstku a na předřadných odporech. Tok výkonu i ztrát ukazuje blokový diagram nahoře." [T5]
### Ztráty na diodách a příkon ze sítě (a)
"V každé půlvlně vedou dvě diody v sérii a oběma teče celý proud zátěže; každá na sobě drží úbytek U_F, a tak se na nich mění v teplo výkon dvou úbytků krát proud." [T5]
relation P_D == 2·U_F·I_z {eq=ZtrataD}
P_D := 2·U_F·I_z | W
"Příkon ze sítě je výstupní výkon plus ztráty před výstupem, tedy v transformátoru a na diodách. Ztráty na předřadných odporech už jsou ve výstupním výkonu P_out obsaženy." [T5]
relation P_in == P_out + P_D + P_Fe + P_Cu {eq=Prikon}
P_in := P_out + P_D + P_Fe + P_Cu | W
"Kontrola energetickou bilancí: příkon se rovná užitečnému výkonu LED plus všem ztrátám (odpory, diody, železo, vinutí)."
check "Bilance výkonů celého zdroje": abs(P_in - P_LED - P_Rs - P_D - P_Fe - P_Cu) ≤ 0.000001 W
### Celková účinnost zdroje (b)
"Užitečný je jen výkon, který dostanou LED; účinnost je jeho podíl na příkonu ze sítě." [T5]
relation η == P_LED/P_in {eq=Ucinnost}
η := P_LED/P_in {digits=3}
### Největší dovolený tepelný odpor chladiče (c)
![](images/chladic.svg){width=75% alt="Nahoře je řez součástkou přišroubovanou přes tenkou vrstvu pasty k žebrovanému chladiči, do součástky míří červená šipka tepelného výkonu P_D. Popisky vyznačují čip T_j, pouzdro T_c a povrch chladiče T_s. Dole je řetězec tepelných odporů R_jc, R_cs a R_sa mezi uzly T_j, T_c, T_s a T_a a vzorec pro teplotu T_j."}
"Teplo z čipu prochází postupně čipem do pouzdra, pastou do chladiče a z chladiče do vzduchu. Tepelné odpory jsou v sérii a teplota na každém roste s tepelným výkonem jako úbytek napětí na rezistorech v sérii (viz obrázek chladiče)." [T5]
"Největší dovolený odpor chladiče plyne z podmínky, aby teplota čipu právě dosáhla T_jmax: celý dovolený rozdíl teplot se rozdělí na tři odpory a chladiči zbude to, co nespotřebují čip a pasta." [T5]
relation R_sa_max == (T_jmax - T_a)/P_D - R_jc - R_cs {eq=Chladic}
R_sa_max := (T_jmax - T_a)/P_D - R_jc - R_cs | K/W
check "Chladič stačí": R_sa ≤ R_sa_max
### Teplota pouzdra a čipu se zvoleným chladičem (d)
"Pouzdro je teplejší než vzduch o oteplení na pastě a chladiči, čip ještě o oteplení na odporu mezi čipem a pouzdrem." [T5]
relation T_c == T_a + P_D·(R_cs + R_sa) {eq=Tc}
T_c := T_a + P_D·(R_cs + R_sa) | °C
relation T_j == T_c + P_D·R_jc {eq=Tj}
T_j := T_c + P_D·R_jc | °C
check "Teplota čipu": T_j ≤ T_jmax
"Graf ukazuje teplotu čipu podle tepelného odporu chladiče; zvolený chladič leží pod hranicí T_jmax a největší dovolený odpor je v místě, kde se přímka s hranicí protne."
T_j_R(R_x) := T_a + P_D·(R_jc + R_cs + R_x) | °C
plot(T_j_R(R_x), T_jmax, R_x: 0 K/W .. 20 K/W, points: [R_sa, T_j], title: "Teplota čipu podle tepelného odporu chladiče", xlabel: "R_sa", ylabel: "T_j") | °C
"Většina příkonu skončí v LED, zbytek se mění v teplo v odporech, transformátoru a diodách; zvolený chladič drží čip diod pod nejvyšší dovolenou teplotou a ještě zbývá malá rezerva."
