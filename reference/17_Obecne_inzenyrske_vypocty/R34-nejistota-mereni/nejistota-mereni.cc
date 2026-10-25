# Nejistota měření: doba kyvu kyvadla a průřez drátu
"Podle sbírky Chyby a nejistoty měření – příklady (Z. Budinská, ČVUT v Praze, Fakulta strojní), řešené příklady 1 a 4. Nejdřív doba kyvu torzního kyvadla z opakovaného měření stopkami: nejistota typu A ze rozptylu měření, typu B z přesnosti stopek a jejich kombinace. Pak průřez drátu z jednoho měření mikrometrem: jak se nejistota průměru přenese do plochy. Obrázek je vlastní."
"Zdroj: https://www.fs.cvut.cz/content/files/12102/2024nejistotypriklady.pdf"

## Doba kyvu torzního kyvadla (příklad 1)
"Mechanickými stopkami se pětkrát odečetl čas po čtvrtém kmitu, tedy po osmi kyvech:"
t_i := [18.60, 18.55, 18.60, 18.70, 18.65] s
N_k := 8
![Torzní kyvadlo: kotouč na drátu kmitá kolem svislé osy; jeden kmit jsou dva kyvy](images/kyvadlo.svg){width=45%}
T_k := mean(t_i)/N_k | s {eq}
"Nejistota typu A je směrodatná odchylka průměru, přepočtená na jeden kyv:"
u_A := stdev(t_i)/sqrt(len(t_i))/N_k | s {eq}
"Nejistota typu B ze stopek: chyba odečtu a reakce asi 0,3 s s rovnoměrným rozdělením, opět na jeden kyv:"
Δ_t := 0.3 s
u_B := Δ_t/(N_k·sqrt(3)) | s {eq}
u_c := sqrt(u_A^2 + u_B^2) | s {eq}
"Výsledek: T_k = (2,328 ± 0,022) s. Zdroj zaokrouhluje u_B na 0,022 s a kombinovanou nejistotu nahoru na 0,023 s. Převládá nejistota stopek: opakováním měření by se výsledek zpřesnil jen málo."

## Průřez drátu (příklad 4)
d := 0.81 mm                  ' průměr změřený mikrometrem
Δ_d := 0.01 mm                ' nejmenší dílek mikrometru
S_d := π·d^2/4 | mm^2 {eq}
"Měřilo se jednou, nejistota je jen typu B. Relativní nejistota plochy je dvojnásobkem relativní nejistoty průměru, protože průměr je ve vzorci ve druhé mocnině:"
u_d := Δ_d/sqrt(3) | mm
u_rS := 2·u_d/d | % {eq}
u_S := S_d·u_rS | mm^2 {eq}
"Výsledek: S = (0,5153 ± 0,0074) mm², relativně 1,4 %, jako ve zdroji."
