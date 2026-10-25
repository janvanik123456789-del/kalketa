# Hrubování válcové plochy: nůž z rychlořezné oceli, nebo destička ze slinutého karbidu
"Podle Malé zbierky príkladov z technológie obrábania (E. Čirčová, P. Ižol, TU v Košiciach, 2004), příklad 1. Na sérii 350 součástí se vnějším podélným soustružením hrubuje válcová plocha. Lze použít nůž z rychlořezné oceli (RO) nebo držák s vyměnitelnou destičkou ze slinutého karbidu (SK). Pro oba nástroje určíme otáčky vřetena, strojní čas na jednu součást a počet ostří pro celou sérii. Každý nástroj je jedna varianta výpočtu. Řezné podmínky jsou ze zdroje (obrobitelnost 14b), obrázek je vlastní."
"Zdroj: https://web.archive.org/web/2023/https://www.sjf.tuke.sk/ktmappv/images/E_materialy/priklady_obrabanie.pdf (kopie ve webovém archivu; na stránkách univerzity už soubor není)"

## Zadání
D := 72 mm                    ' průměr polotovaru
l := 138 mm                   ' délka obráběné plochy
l_n := 5 mm                   ' nájezd nože
n_s := 350                    ' součástí v sérii
a_p := 3 mm                   ' hloubka řezu
f := 0.18 mm                  ' posuv na otáčku
"Nástroje: řezná rychlost, trvanlivost ostří a počet ostří, které nástroj dá. Nůž z RO se po otupení přeostří (každá trvanlivost je jedno ostří), destička SK má čtyři využitelné hrany a pak se vymění."
table Nastroje: {variants=SK}
    | nastroj | v_c [m/min] | T [min] | z |
    | RO      | 45          | 60      | 1 |
    | SK      | 155         | 45      | 4 |
![Podélné soustružení: obrobek o průměru D otáčkami n, nůž s posuvem f a hloubkou řezu a_p, dráha nože L z nájezdu l_n a délky plochy l](images/soustruzeni.svg){width=80%}

## Otáčky a strojní čas
n := v_c/(π·D) | min^-1 {eq}
L := l + l_n | mm
t_m := L/(n·f) | min {eq}
t_s := n_s·t_m | h
"Pro RO zdroj zaokrouhluje otáčky na 199 min⁻¹ a čas na 3,99 ≐ 4 min, pro SK na 685 min⁻¹ a 1,2 min."

## Spotřeba nástrojů
"Kolik součástí obrobí jeden nástroj (nůž RO mezi dvěma přeostřeními, destička SK všemi čtyřmi hranami), kolik nástrojů spotřebuje série a kolikrát se tedy nástroj přeostří nebo vymění:"
p := floor(z·T/t_m)
k := ceil(n_s/p)
k_v := k - 1
"Nůž z RO se za sérii přeostří 23krát, destičky SK budou potřeba tři a vymění se dvakrát, jako ve zdroji. Ten počítá s časem zaokrouhleným na 1,2 min a destička mu vychází na 150 součástí místo 155."

## Srovnání nástrojů
porovnani := compare(Nastroje, n, t_m, t_s, p, k)
"Destička SK obrábí 3,4krát rychleji: celá série jí trvá necelých 7 hodin místo 23."
