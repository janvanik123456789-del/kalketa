# Nastavení regulátoru metodou kritického zesílení (Ziegler–Nichols)
"Podle stránky Ziegler–Nichols method na picuino.com (C. F. Pardo Martín), příklad metody kritického zesílení: regulace teploty simulované pece. Regulátor se nejdřív nastaví jako čistě proporcionální a jeho zesílení se zvyšuje, dokud regulovaná teplota nezačne kmitat se stálou amplitudou. Z tohoto kritického zesílení a periody kmitů dají pravidla tabulky konstanty regulátorů P, PI, PD a PID. Každý typ regulátoru je jedna varianta výpočtu, srovnání je na konci. Schéma regulační smyčky je vlastní."

## Zkouška na mezi stability
"Při K_p = 0,40 se kmity utlumily, při 0,45 rostly. Trvalé kmitání nastalo při zesílení 0,43 a čtyři periody kmitů trvaly 21 s."
K_c := 0.43                   ' kritické zesílení
T_c := 21 s/4                 ' perioda kritických kmitů
![Regulační smyčka: žádaná teplota, regulátor PID, pec a zpětná vazba teploty; při kritickém zesílení teplota kmitá s periodou T_c](images/smycka.svg){width=85%}

## Pravidla nastavení
"Konstanty regulátoru jsou násobky kritického zesílení a periody. Tabulka zdroje pro regulátor tvaru u = K_p·e + K_i·∫e dt + K_d·de/dt:"
table Regulator: {variants=PID}
    | typ | a_p  | a_i  | a_d   |
    | P   | 0.50 | 0    | 0     |
    | PI  | 0.45 | 0.54 | 0     |
    | PD  | 0.80 | 0    | 0.075 |
    | PID | 0.59 | 1.18 | 0.075 |
K_p := a_p·K_c {eq}
K_i := a_i·K_c/T_c | s^-1 {eq}
K_d := a_d·K_c·T_c | s {eq}

## Srovnání typů regulátoru
porovnani := compare(Regulator, K_p, K_i, K_d)
"Zdroj píše periodu jako 5,3 s. Derivační konstanty (0,169) počítá s přesnou hodnotou 21/4 = 5,25 s, integrační (0,096 u PID) se zaokrouhlenou 5,3 s; s 5,25 s je K_i = 0,0966 s⁻¹. Proporcionální konstanta PI vychází 0,1935, zdroj uvádí 0,195."
"Integrační složka odstraní trvalou regulační odchylku regulátoru P, derivační tlumí kmitání. Proto má PD a PID větší proporcionální zesílení než P a PI."
