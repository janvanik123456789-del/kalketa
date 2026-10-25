# Vlastní frekvence, tvary kmitů a volné kmitání soustavy dvou hmot
"Podle příkladů přednášky 4 předmětu 53/58:153 Fundamentals of Vibration (University of Iowa, S. Xiao). Dvě hmoty na přímce, mezi stěnami spojené třemi pružinami: stěna – k_1 – m_1 – k_2 – m_2 – k_3 – stěna. Úloha: vlastní frekvence a tvary kmitů, pak volné kmitání, když první hmotu vychýlíme o 1 a pustíme. Zdroj neuvádí jednotky; bereme kilogramy, newtony na metr a metry. Řešení ve zdroji je jen v obrázcích, proto je ověřené samostatně (vlastní čísla v Pythonu i ručně z kvadratické rovnice). Teorie je ve vrstvě Podklady."
"Zdroj: https://user.engineering.uiowa.edu/~sxiao/class/058-153/lecture-4.pdf"

## Zadání
m_1 := 9 kg
m_2 := 1 kg
k_1 := 38 N/m
k_2 := 2 N/m
k_3 := 3 N/m
y_10 := 1 m                 ' počáteční výchylka první hmoty
![Dvě hmoty mezi stěnami spojené třemi pružinami; výchylky y₁ a y₂ od rovnovážné polohy](images/hmoty.svg){width=75%}

## Pohybové rovnice
"Pro každou hmotu: setrvačná síla a síly pružin, které na ni působí (druhý Newtonův zákon, viz Podklady). V maticovém tvaru M·ÿ + K·y = 0:"
M := [m_1, 0 kg | 0 kg, m_2]
K := [k_1 + k_2, -k_2 | -k_2, k_2 + k_3]

## Vlastní frekvence
"Harmonické řešení y = φ·cos(ω·t) dává podmínku det(K − ω²·M) = 0, kvadratickou rovnici pro Ω = ω²:"
solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0
"Totéž jako vlastní čísla zobecněné úlohy K·φ = Ω·M·φ:"
Ω_v := eigenvals(K, M)
ω_1 := sqrt(Ω_v[1]) | rad/s
ω_2 := sqrt(Ω_v[2]) | rad/s
f_1 := ω_1/(2·π) | Hz
f_2 := ω_2/(2·π) | Hz

## Tvary kmitů
"Vlastní vektory (sloupce, největší prvek 1): poměr výchylek obou hmot v každém tvaru."
Φ := eigenvecs(K, M)
r_1 := Φ[2, 1]/Φ[1, 1]
r_2 := Φ[2, 2]/Φ[1, 2]
"V prvním tvaru se obě hmoty pohybují stejným směrem, lehčí druhá dvojnásobně; ve druhém proti sobě. Vyšší frekvence patří tvaru se změnou směru."

## Volné kmitání z počáteční výchylky
"Řešení je součet obou tvarů, y(t) = C_1·φ_1·cos(ω_1·t) + C_2·φ_2·cos(ω_2·t) (počáteční rychlosti jsou nulové). Amplitudy C plynou z počátečních výchylek y(0) = [y_10, 0]:"
C := lsolve(Φ, [y_10, 0 m])
y_1(t) := C[1]·Φ[1, 1]·cos(ω_1·t) + C[2]·Φ[1, 2]·cos(ω_2·t)
y_2(t) := C[1]·Φ[2, 1]·cos(ω_1·t) + C[2]·Φ[2, 2]·cos(ω_2·t)
plot(y_1(t), y_2(t), t: 0 s .. 60 s, samples: 800, title: "Výchylky obou hmot: rázy") | m
"Frekvence jsou si blízko, proto se energie přelévá mezi hmotami v rázech; jejich perioda je:"
T_r := 2·π/(ω_2 - ω_1) | s
