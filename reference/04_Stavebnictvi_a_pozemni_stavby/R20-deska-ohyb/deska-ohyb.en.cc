# Design and check of the bending reinforcement of a floor slab
"Based on example 3 of a Czech textbook from CTU in Prague, Faculty of Civil Engineering (Examples of the Design of Concrete Structures to Eurocode 2; EN 1992-1-1, second generation). A one-way spanning floor slab 200 mm thick, the design bending moment at the bottom fibres from a linear elastic analysis, concrete C30/37 of strength development class CR, steel B500B. The calculation is for a strip of the slab 1 m wide, so the moment and the area of reinforcement are related to a metre of width. The theory (concrete strength, the rectangular stress block, three ways of design, detailing rules) is in the Sources layer."
"Source: Příklady navrhování betonových konstrukcí podle Eurokódu 2, ČVUT v Praze, Fakulta stavební, https://people.fsv.cvut.cz/~bilypet1/vyuka/Skripta/P%c5%99%c3%adklady%20navrhov%c3%a1n%c3%ad%20BK%20EC2_2G.pdf"

## Input
h := 200 mm                ' thickness of the slab
m_Ed := 40 kN·m/m          ' design moment per metre of width
c := 25 mm                 ' concrete cover
Ø := 12 mm                 ' diameter of the main reinforcement
beton := pick(Betony, "C30/37")
f_yk := 500 MPa            ' steel B500B
E_s := 200 GPa
ε_cu := 0.0035             ' ultimate strain of concrete in compression
γ_C := 1.5
γ_S := 1.15
![A strip of the slab 1 m wide: thickness h, cover c, main reinforcement Ø at the bottom surface, effective depth d](images/deska.en.svg){width=70%}

## Materials
"Concrete: the factor η_cc reduces the design strength of higher classes, k_tc = 1 for concrete of class CR loaded no sooner than after three months (see Sources)."
η_cc := min((40 MPa/beton.f_ck)^(1/3), 1)
k_tc := 1
f_cd := η_cc·k_tc·beton.f_ck/γ_C | MPa
f_ctm := beton.f_ctm | MPa
"Steel: the design yield strength, the strain at yield and the relative height of the compression zone at which the reinforcement just reaches yield:"
f_yd := f_yk/γ_S | MPa
ε_yd := f_yd/E_s
ξ_bal := ε_cu/(ε_cu + ε_yd)

## Design of the bending reinforcement
"Effective depth of the slab:"
d := h - c - Ø/2 | mm
"1. Simplified, with an estimate of the lever arm of the internal forces z = 0.9·d:"
a_s_req := m_Ed/(0.9·d·f_yd) | mm^2/m
"2. With the moment and dimension coefficients (the table Soucinitele_P04, linearly between rows):"
μ := m_Ed/(d^2·f_cd)
ζ := interpolate(Soucinitele_P04, μ: μ).ζ
a_s_req_2 := m_Ed/(ζ·d·f_yd) | mm^2/m
"3. By direct calculation from the equilibrium of forces and moments:"
a_s_req_3 := d·f_cd/f_yd·(1 - sqrt(1 - 2·m_Ed/(d^2·f_cd))) | mm^2/m
"Any of the three procedures is enough; what matters is that the check is satisfied. Design: bars Ø12 at 150 mm."
s := 150 mm
a_s_prov := π·Ø^2/4/s | mm^2/m

## Check
"Height of the compression zone and the resistance of the section with the designed reinforcement (d does not change, the bars stayed Ø12):"
x := a_s_prov·f_yd/(0.8·f_cd) | mm
m_Rd := a_s_prov·f_yd·(d - 0.4·x) | kN·m/m
check "Bending": m_Ed ≤ m_Rd source "EN 1992-1-1; textbook, appendix P04"

## Check of the reinforcement
"At the ultimate limit state the reinforcement has yielded:"
check "Reinforcement beyond yield": x/d ≤ ξ_bal
"Minimum reinforcement: the resistance must exceed the cracking moment, at which the concrete in tension would crack:"
m_cr := h^2·f_ctm/6 | kN·m/m
check "Minimum reinforcement": m_cr ≤ m_Rd source "textbook, appendix P05, row 1"
s_slab_max := min(3·h, 400 mm) | mm
check "Spacing of main bars": s ≤ s_slab_max source "textbook, appendix P05, row 7"

## Distribution reinforcement
"The slab needs no reinforcement in the perpendicular direction for the moment, but it must have at least a fifth of the main reinforcement. Design: Ø6 at 200 mm."
a_s_rv_req := 0.2·a_s_req | mm^2/m
s_rv := 200 mm
a_s_rv := π·(6 mm)^2/4/s_rv | mm^2/m
check "Distribution reinforcement": a_s_rv_req ≤ a_s_rv source "textbook, appendix P05, row 3"
check "Spacing of distribution bars": s_rv ≤ s_slab_max source "textbook, appendix P05, row 7"
