# Návrh a posouzení ohybové výztuže stropní desky
"Podle příkladu 3 skript Příklady navrhování betonových konstrukcí podle Eurokódu 2 (ČVUT v Praze, Fakulta stavební; EN 1992-1-1 druhé generace). Jednosměrně pnutá stropní deska tloušťky 200 mm, návrhový ohybový moment při spodních vláknech od lineárně pružné analýzy, beton C30/37 třídy vývoje pevnosti CR, ocel B500B. Počítá se na pruh desky široký 1 m, proto jsou moment a plocha výztuže vztažené na metr šířky. Teorie (pevnost betonu, obdélníkové rozdělení napětí, tři způsoby návrhu, konstrukční zásady) je ve vrstvě Podklady."
"Zdroj: https://people.fsv.cvut.cz/~bilypet1/vyuka/Skripta/P%c5%99%c3%adklady%20navrhov%c3%a1n%c3%ad%20BK%20EC2_2G.pdf"

## Zadání
h := 200 mm                ' tloušťka desky
m_Ed := 40 kN·m/m          ' návrhový moment na metr šířky
c := 25 mm                 ' krycí vrstva
Ø := 12 mm                 ' průměr nosné výztuže
beton := pick(Betony, "C30/37")
f_yk := 500 MPa            ' ocel B500B
E_s := 200 GPa
ε_cu := 0.0035             ' mezní přetvoření betonu v tlaku
γ_C := 1.5
γ_S := 1.15
![Pruh desky širokého 1 m: tloušťka h, krycí vrstva c, nosná výztuž Ø při spodním povrchu, účinná výška d](images/deska.svg){width=70%}

## Materiály
"Beton: součinitel η_cc zmenšuje návrhovou pevnost vyšších tříd, k_tc = 1 pro beton třídy CR zatížený nejdřív po třech měsících (viz Podklady)."
η_cc := min((40 MPa/beton.f_ck)^(1/3), 1)
k_tc := 1
f_cd := η_cc·k_tc·beton.f_ck/γ_C | MPa
f_ctm := beton.f_ctm | MPa
"Ocel: návrhová mez kluzu, přetvoření na mezi kluzu a poměrná výška tlačené oblasti, při které výztuž právě dosáhne meze kluzu:"
f_yd := f_yk/γ_S | MPa
ε_yd := f_yd/E_s
ξ_bal := ε_cu/(ε_cu + ε_yd)

## Návrh ohybové výztuže
"Účinná výška desky:"
d := h - c - Ø/2 | mm
"1. Zjednodušeně s odhadem ramene vnitřních sil z = 0,9·d:"
a_s_req := m_Ed/(0.9·d·f_yd) | mm^2/m
"2. Pomocí momentového a rozměrových součinitelů (tabulka Soucinitele_P04, mezi řádky lineárně):"
μ := m_Ed/(d^2·f_cd)
ζ := interpolate(Soucinitele_P04, μ: μ).ζ
a_s_req_2 := m_Ed/(ζ·d·f_yd) | mm^2/m
"3. Přímým výpočtem z rovnováhy sil a momentů:"
a_s_req_3 := d·f_cd/f_yd·(1 - sqrt(1 - 2·m_Ed/(d^2·f_cd))) | mm^2/m
"Kterýkoli ze tří postupů stačí; podstatné je, aby vyhověl posudek. Návrh: pruty Ø12 po 150 mm."
s := 150 mm
a_s_prov := π·Ø^2/4/s | mm^2/m

## Posouzení
"Výška tlačené oblasti a únosnost průřezu s navrženou výztuží (d se nemění, profil prutů zůstal Ø12):"
x := a_s_prov·f_yd/(0.8·f_cd) | mm
m_Rd := a_s_prov·f_yd·(d - 0.4·x) | kN·m/m
check "Ohyb": m_Ed ≤ m_Rd source "EN 1992-1-1; skripta, příloha P04"

## Kontrola vyztužení
"Výztuž je při dosažení mezního stavu únosnosti za mezí kluzu:"
check "Výztuž za mezí kluzu": x/d ≤ ξ_bal
"Minimální výztuž: únosnost je větší než moment na mezi vzniku trhlin, při kterém by beton v tahu praskl:"
m_cr := h^2·f_ctm/6 | kN·m/m
check "Minimální výztuž": m_cr ≤ m_Rd source "skripta, příloha P05, řádek 1"
s_slab_max := min(3·h, 400 mm) | mm
check "Rozteč nosných prutů": s ≤ s_slab_max source "skripta, příloha P05, řádek 7"

## Rozdělovací výztuž
"Výztuž v kolmém směru deska na moment nepotřebuje, ale musí mít aspoň pětinu nosné výztuže. Návrh: Ø6 po 200 mm."
a_s_rv_req := 0.2·a_s_req | mm^2/m
s_rv := 200 mm
a_s_rv := π·(6 mm)^2/4/s_rv | mm^2/m
check "Rozdělovací výztuž": a_s_rv_req ≤ a_s_rv source "skripta, příloha P05, řádek 3"
check "Rozteč rozdělovacích prutů": s_rv ≤ s_slab_max source "skripta, příloha P05, řádek 7"
