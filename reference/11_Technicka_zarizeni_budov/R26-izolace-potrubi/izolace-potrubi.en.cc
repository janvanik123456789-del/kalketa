# Optimal insulation thickness of a central heating pipe
"After example 1 of the opinion of SEI (the Czech State Energy Inspectorate) “Are the prescribed heat transfer coefficients binding for determining the insulation thickness?” (TZB-info, in Czech). A steel central heating pipe DN 40 in the technical floor of an apartment building in Melnik, insulation shells of mineral wool with aluminium foil. The manufacturer supplies five thicknesses; each is one variant of the calculation. The optimum is the one with the smallest sum of the price of the insulation and the price of the heat that escapes through the pipe during the assessed period of two years. The section of the pipe is our own."
"Source: https://www.tzb-info.cz/4564-stanovisko-sei-jsou-predepisovane-hodnoty-soucinitelu-prostupu-tepla-pro-urceni-tloustky-izolace-zavazne"

## Input
d := 48.3 mm                  ' outer diameter of the pipe DN 40
s_t := 3.25 mm                ' wall thickness of the pipe
λ_t := 50 W/(m·K)             ' steel
λ_iz := 0.038 W/(m·K)         ' mineral wool with aluminium foil
α_e := 10 W/(m^2·K)           ' heat transfer from the insulation surface to the surroundings
t_w := 75 °C                  ' maximum water temperature
t_o := 10 °C                  ' mean temperature in the technical floor in the heating season
"The heating season in Melnik according to the Czech standard ČSN 73 0540 (2005) and the price of heat from district heating:"
t_e := -13 °C                 ' outdoor design temperature
t_v := 3.7 °C                 ' mean outdoor temperature in the heating season
t_i := 20 °C                  ' heated living spaces
d_12 := 219                   ' days of the heating season per year
C_tp := 400 Kč/GJ             ' current price of heat
z := 8 %                      ' average annual increase of the price of heat
i_f := 3 %                    ' expected inflation
n := 2                        ' assessed period in years
"Variants: the thicknesses of the shells the manufacturer supplies and their price per metre. The calculation below is written out for the chosen thickness, the comparison of all of them is at the end."
table Izolace: {variants=50mm}
    | pouzdro | δ_iz [mm] | C_iz [Kč/m] |
    | 20mm    | 20        | 79          |
    | 25mm    | 25        | 86          |
    | 30mm    | 30        | 95          |
    | 40mm    | 40        | 106         |
    | 50mm    | 50        | 118         |
![Section of the insulated pipe: water at temperature t_m, steel wall, insulation of thickness δ_iz, surroundings t_o](images/potrubi.en.svg){width=60%}

## Water temperature and price of heat
"The water is not at 75 °C for the whole heating season: its temperature is controlled by the outdoor temperature (weather-compensated, or equithermal, control). Mean water temperature in the heating season:"
t_m := (t_w - t_i)·(t_v - t_e)/(t_i - t_e) + t_i | °C {eq}
"The price of heat grows faster than inflation; the mean real price of heat in the assessed period:"
C_ts := C_tp·((1 + z - i_f)^n - 1)/(n·(z - i_f)) | Kč/kWh {eq}

## Heat loss of the insulated pipe
"Heat transfer coefficient per metre of length: the thermal resistances of the pipe wall, the insulation and the heat transfer to the surroundings in series (the transfer from water to the wall is neglected)."
D := d + 2·δ_iz | mm
U_o := π/(ln(d/(d - 2·s_t))/(2·λ_t) + ln(D/d)/(2·λ_iz) + 1/(α_e·D)) | W/(m·K) {eq}
q := U_o·(t_m - t_o) | W/m {eq}
"The price of the heat that escapes through the pipe during the assessed period, and the total cost per metre of pipe:"
N_p := q·C_ts·24 h·d_12·n | Kč/m {eq}
N := N_p + C_iz | Kč/m {eq}

## Comparison of thicknesses
porovnani := compare(Izolace, U_o, q, N_p, C_iz, N)
nejlepsi := find_min(porovnani, by: N).pouzdro
"The smallest cost over two years belongs to the 50 mm shell, as in the source (237.50 Kč/m). An insulation 10 mm thicker saves heat worth 16 Kč/m but costs 12 Kč/m more: the differences get smaller, so for a longer period an even thicker one would pay off. The source also gives 60 mm (250.30 Kč/m) but does not state the price of that shell."
