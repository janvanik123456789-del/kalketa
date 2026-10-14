# Klikový mechanismus parního motoru
"Podle článku J. Škorpík: Základní rovnice klikového mechanismu parního motoru, Transformační technologie, kap. 31 (www.transformacni-technologie.cz/31.html). Rozměry motoru a průběh tlaku páry článek neuvádí (jsou v placených přílohách); hodnoty níže jsou předpoklad pro ukázku, nahraďte je svými. Obrázky jsou vlastní, kreslené podle vzorců článku. Vše v jednotkách SI: otáčky v s⁻¹, úhly v radiánech."

## Zadání
![Klikový mechanismus: poloha pístu x od horní úvratě, ojnice o, klika r, pootočení hřídele φ, úhel ojnice γ](images/mechanismus.svg){width=90%}
"Klikový mechanismus (Obrázek 558 článku):"
r := 0.05 m             ' rameno kliky
o := 0.25 m             ' délka ojnice
s := 2·r                ' zdvih pístu
"Válec dvojčinného motoru:"
d := 0.10 m             ' průměr válce
d_T := 0.03 m           ' průměr pístní tyče
x_0 := 0.01 m           ' škodný prostor jako délka válce
m_p := 6 kg             ' posuvné hmoty: píst, pístní tyč, smykadlo, 1/3 ojnice
η_m := 0.9              ' mechanická účinnost (Úloha 776)
"Pára (zjednodušený p-V diagram: plnění do ε zdvihu, pak expanze p·V = konst., výfuk):"
![Předpokládaný průběh tlaku páry v komoře nad pístem během zdvihu](images/tlak-pary.svg){width=75%}
p_1 := 0.8 MPa {slider=0.5..2..0.05}    ' tlak admisní páry
p_2 := 0.12 MPa         ' tlak ve výfuku
p_at := 0.1 MPa         ' tlak ve skříni hřídele
ε := 0.3 {slider=0.1..0.8..0.05}        ' plnění
"Soustrojí s asynchronním generátorem (Úloha 785):"
P_G := 15 kW            ' jmenovitý výkon generátoru
n_G := 25.75 [s^-1]     ' jmenovité otáčky (1 545 ot./min)
n_0 := 25 [s^-1]        ' otáčky při nulovém výkonu (1 500 ot./min)
P_ZG := 1500 W          ' ztrátový výkon generátoru
N := 1/300              ' požadovaná nerovnoměrnost chodu

## Poloha pístu
"Poloha pístu od horní úvrati (Rovnice 559):"
x(φ) := o + r - sqrt(o^2 - (r·sin(φ))^2) - r·cos(φ)
"Úhel ojnice ke směru pohybu pístu (Rovnice 764):"
γ(φ) := asin(r/o·sin(φ))
"Pootočení hřídele k poloze pístu zadané v procentech zdvihu (Rovnice 768), např. konec plnění:"
φ_ε := acos((r^2 + (o + r - r/50·100·ε)^2 - o^2)/(2·r·(o + r - r/50·100·ε))) | rad

## Síly
"Tlak páry nad pístem (komora H) a pod pístem (komora D): plnění, expanze, výfuk."
p_H(φ) := if(sin(φ) >= 0, if(x(φ) <= ε·s, p_1, p_1·(ε·s + x_0)/(x(φ) + x_0)), p_2)
p_D(φ) := if(sin(φ) < 0, if(s - x(φ) <= ε·s, p_1, p_1·(ε·s + x_0)/(s - x(φ) + x_0)), p_2)
"Síly od tlaku páry a setrvačná síla posuvných hmot (Rovnice 347, tíhu zanedbáváme):"
F_H(φ) := π·d^2/4·p_H(φ)
F_D(φ) := π/4·((d^2 - d_T^2)·p_D(φ) + d_T^2·p_at)
ω_n := 2·π·n_0 | rad/s   ' úhlová rychlost pro setrvačné síly
k(φ) := ω_n^2·r·(cos(φ) + r/o·cos(2·φ))
F_s(φ) := -k(φ)·m_p
F_p(φ) := F_H(φ) - F_D(φ) + F_s(φ)
![Síly v klikovém mechanismu: síla na píst F_p, síla v ojnici F_l, síla na vedení F_k, otáčivá složka F_M a moment M_p](images/sily.svg){width=90%}
"Síla v ojnici a síla na vedení pístní tyče (Rovnice 764; síla v ojnici je F_p / cos γ, takže F_k = F_p·tg γ):"
F_l(φ) := F_p(φ)/cos(γ(φ))
F_k(φ) := F_l(φ)·sin(γ(φ))
plot(F_p(φ), F_s(φ), F_k(φ), φ: 0 .. 2·π, title: "Síly na klikový mechanismus (Obrázek 766)") | kN

## Kroutící moment
"Moment od síly v ojnici (Rovnice 774) a jeho střední hodnota za otáčku:"
M_p(φ) := F_l(φ)·sin(φ + γ(φ))·r
A_i := integral(M_p(φ), φ: 0 .. 2·π) | J      ' vnitřní práce za otáčku
M_i := A_i/(2·π) | N·m
"Ztrátový moment z mechanické účinnosti, stálý (Obrázek 777); moment na výstupním hřídeli (Vzorec 773):"
M_Z := (1 - η_m)·M_i
M_k(φ) := M_p(φ) - M_Z
plot(M_p(φ), M_k(φ), φ: 0 .. 2·π, title: "Kroutící moment") | N·m

## Otáčky soustrojí
"Příkon generátoru je lineární v úhlové rychlosti, P_sp = a·ω + b (Obrázek 784): při n_0 kryje jen ztráty, při n_G i jmenovitý výkon."
ω_0 := 2·π·n_0 | rad/s
ω_G := 2·π·n_G | rad/s
a := P_G/(ω_G - ω_0) | W·s
b := P_ZG - a·ω_0 | W
"Střední úhlová rychlost: střední moment motoru se rovná momentu generátoru, η_m·M_i·ω = a·ω + b."
solve ω_s: η_m·M_i·ω_s == a·ω_s + b in ω_0 .. 2·ω_G
n_s := ω_s/(2·π) | s^-1
P_m := η_m·M_i·ω_s | kW
check "otáčky v pracovním rozsahu generátoru": n_0 ≤ n_s and n_s ≤ n_G

## Setrvačník
"Střední moment, kterým motor otáčí generátorem; kde ho moment motoru převyšuje, soustrojí zrychluje, jinde zpomaluje."
M_s := η_m·M_i
"Moment proti střednímu protíná nulu čtyřikrát za otáčku (dvojčinný válec): kolem každé ze dvou špiček momentu."
φ_a := maximize(M_k(φ), φ: 0 .. π)
φ_b := maximize(M_k(φ), φ: π .. 2·π)
solve φ_1: M_k(φ_1) == M_s in 0 .. φ_a
solve φ_2: M_k(φ_2) == M_s in φ_a .. π
solve φ_3: M_k(φ_3) == M_s in π .. φ_b
solve φ_4: M_k(φ_4) == M_s in φ_b .. 2·π
"Přebytky a nedostatky práce mezi průsečíky:"
A_1 := integral(M_k(φ) - M_s, φ: φ_1 .. φ_2) | J
A_2 := integral(M_k(φ) - M_s, φ: φ_2 .. φ_3) | J
A_3 := integral(M_k(φ) - M_s, φ: φ_3 .. φ_4) | J
plot(M_k(φ) - M_s, φ: 0 .. 2·π, area: φ_1 .. φ_2, roots: true, title: "Moment nad a pod středním: přebytek práce A_1") | N·m
"Práce nashromážděná od φ_1 v průsečících; setrvačník vyrovnává její rozkmit ΔA:"
A_e := [0 J, A_1, A_1 + A_2, A_1 + A_2 + A_3]
ΔA := max(A_e) - min(A_e) | J
"Moment setrvačnosti soustrojí pro nerovnoměrnost N = (ω_max − ω_min)/ω_s (Obrázek 783), ΔA = J·ω_s²·N:"
J := ΔA/(N·ω_s^2) | kg·m^2
"Co to znamená: otáčky během jedné otáčky kolísají jen o"
Δn := N·n_s | s^-1
n_max := n_s + Δn/2 | s^-1
n_min := n_s - Δn/2 | s^-1
"Kinetická energie soustrojí; rozkmit práce ΔA je z ní jen nepatrná část (2·N), proto otáčky skoro nekolísají:"
E_k := J·ω_s^2/2 | kJ
"Takový moment setrvačnosti má plný ocelový kotouč průměru D_s, šířky b_s a hmotnosti m_s:"
![Setrvačník jako plný ocelový kotouč: průměr D_s, šířka b_s, obvodová rychlost v_s](images/setrvacnik.svg){width=70%}
D_s := 0.5 m
ρ_s := 7850 kg/m^3
b_s := 32·J/(π·ρ_s·D_s^4) | mm     ' z J = π·ρ·b·D⁴/32
m_s := ρ_s·π·D_s^2/4·b_s | kg
"Obvodová rychlost kotouče; mez je předpoklad pro plný ocelový kotouč, u litiny se bere asi poloviční:"
v_s := ω_s·D_s/2 | m/s
v_dov := 60 [m/s]
check "obvodová rychlost setrvačníku": v_s ≤ v_dov
