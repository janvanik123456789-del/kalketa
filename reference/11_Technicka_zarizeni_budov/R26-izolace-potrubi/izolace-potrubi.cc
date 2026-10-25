# Optimální tloušťka izolace potrubí ústředního vytápění
"Podle příkladu 1 ze stanoviska SEI Jsou předepisované hodnoty součinitelů prostupu tepla pro určení tloušťky izolace závazné? (TZB-info). Ocelové potrubí DN 40 ústředního vytápění v technickém podlaží bytového domu v Mělníku, izolační pouzdra z minerální vlny s hliníkovou fólií. Výrobce dodává pět tlouštěk; každá je jedna varianta výpočtu. Optimální je ta, u které je nejmenší součet ceny izolace a ceny tepla, které potrubím uteče za posuzované období dvou let. Řez potrubím je vlastní."
"Zdroj: https://www.tzb-info.cz/4564-stanovisko-sei-jsou-predepisovane-hodnoty-soucinitelu-prostupu-tepla-pro-urceni-tloustky-izolace-zavazne"

## Zadání
d := 48.3 mm                  ' vnější průměr potrubí DN 40
s_t := 3.25 mm                ' tloušťka stěny potrubí
λ_t := 50 W/(m·K)             ' ocel
λ_iz := 0.038 W/(m·K)         ' minerální vlna s hliníkovou fólií
α_e := 10 W/(m^2·K)           ' přestup tepla z povrchu izolace do okolí
t_w := 75 °C                  ' maximální teplota vody
t_o := 10 °C                  ' střední teplota v technickém podlaží v topném období
"Topné období v Mělníku podle ČSN 73 0540 (2005) a cena tepla z centrálního zásobování:"
t_e := -13 °C                 ' venkovní výpočtová teplota
t_v := 3.7 °C                 ' průměrná venkovní teplota v topném období
t_i := 20 °C                  ' vytápěné prostory pro bydlení
d_12 := 219                   ' dnů topného období za rok
C_tp := 400 Kč/GJ             ' současná cena tepla
z := 8 %                      ' průměrný roční nárůst ceny tepla
i_f := 3 %                    ' očekávaná inflace
n := 2                        ' posuzované období v letech
"Varianty: tloušťky pouzder, které výrobce dodává, a jejich cena za metr. Výpočet níže je rozepsaný pro zvolenou tloušťku, srovnání všech je na konci."
table Izolace: {variants=50mm}
    | pouzdro | δ_iz [mm] | C_iz [Kč/m] |
    | 20mm    | 20        | 79          |
    | 25mm    | 25        | 86          |
    | 30mm    | 30        | 95          |
    | 40mm    | 40        | 106         |
    | 50mm    | 50        | 118         |
![Řez izolovaným potrubím: voda o teplotě t_m, ocelová stěna, izolace tloušťky δ_iz, okolí t_o](images/potrubi.svg){width=60%}

## Teplota vody a cena tepla
"Voda nemá celé topné období 75 °C: teplota se řídí ekvitermně podle venkovní teploty. Střední teplota vody v topném období:"
t_m := (t_w - t_i)·(t_v - t_e)/(t_i - t_e) + t_i | °C {eq}
"Cena tepla roste rychleji než inflace; střední reálná cena tepla v posuzovaném období:"
C_ts := C_tp·((1 + z - i_f)^n - 1)/(n·(z - i_f)) | Kč/kWh {eq}

## Ztráta tepla izolovaným potrubím
"Součinitel prostupu tepla na metr délky: tepelné odpory stěny potrubí, izolace a přestupu do okolí v řadě (přestup z vody do stěny zanedbáme)."
D := d + 2·δ_iz | mm
U_o := π/(ln(d/(d - 2·s_t))/(2·λ_t) + ln(D/d)/(2·λ_iz) + 1/(α_e·D)) | W/(m·K) {eq}
q := U_o·(t_m - t_o) | W/m {eq}
"Cena tepla, které potrubím uteče za posuzované období, a celkové náklady na metr potrubí:"
N_p := q·C_ts·24 h·d_12·n | Kč/m {eq}
N := N_p + C_iz | Kč/m {eq}

## Porovnání tlouštěk
porovnani := compare(Izolace, U_o, q, N_p, C_iz, N)
nejlepsi := find_min(porovnani, by: N).pouzdro
"Nejmenší náklady za dva roky má pouzdro 50 mm, jako ve zdroji (237,50 Kč/m). Silnější izolace o 10 mm ušetří teplo za 16 Kč/m, ale je dražší o 12 Kč/m: rozdíly se zmenšují, takže pro delší období by se vyplatila ještě silnější. Zdroj uvádí i 60 mm (250,30 Kč/m), cenu tohoto pouzdra ale neuvádí."
