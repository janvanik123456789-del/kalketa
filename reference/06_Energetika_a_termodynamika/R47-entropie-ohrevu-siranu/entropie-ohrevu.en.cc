# Entropy change on reversible heating of potassium sulphate
"Based on problem 3, Second law of thermodynamics – practice problems (FC1, Faculty of Science, Palacky University Olomouc): 1 kg of anhydrous potassium sulphate K₂SO₄ is heated reversibly from 25 °C to 427 °C at a pressure of 101.3 kPa. The molar heat capacity depends on temperature (T in kelvins). We find how much the entropy of the substance rises and, for a better picture, also the heat supplied and the mean temperature of heating. The source gives the result 820 J/K."
"Source: FC1 – 2. věta termodynamiky, příklady k procvičení, PřF UP Olomouc, https://www.kfc.upol.cz/wp-content/uploads/2022/02/FC1-PR9-2022.pdf"

## Input
m := 1 kg
M := 174.26 g/mol          ' molar mass of K₂SO₄
t_1 := 25 °C
t_2 := 427 °C
T_1 := t_1 | K
T_2 := t_2 | K
p := 101.3 kPa             ' the pressure is constant and does not enter the calculation directly
"The molar heat capacity at constant pressure changes with temperature according to a polynomial (T in K). In the source text the exponents are scrambled; we read the third coefficient as −17.8·10⁻⁶. With the usual form c = −17.8·10⁵ the result would be about 773 J/K, not the 820 J/K of the source."
a := 120.4 J/(mol·K)
b := 99.6e-3 J/(mol·K^2)
c := -17.8e-6 J·K/mol
c_p(T) := a + b·T + c/T^2
![Molar heat capacity c_p of potassium sulphate against temperature. A strip of width dT at temperature T is the heat dQ = n·c_p·dT and brings the entropy dS = dQ/T. The area under the curve from T_1 to T_2 is the heat per mole; the entropy is the area under c_p/T in the chart below](images/ohrev.en.svg){width=80%}

## Amount of substance
n := m/M | mol

## Entropy change
"In a reversible heating at constant pressure the substance receives at each moment the heat dQ = n·c_p·dT at temperature T, so dS = n·c_p·dT/T. The total change is the sum over all small steps:"
ΔS := n·integral(c_p(T)/T, T: T_1 .. T_2) | J/K
"The same term by term, as it is integrated on paper (T₁, T₂ in kelvins):"
ΔS_ruc := n·(a·ln(T_2/T_1) + b·(T_2 - T_1) - c/2·(1/T_2^2 - 1/T_1^2)) | J/K
"The area under the curve c_p(T)/T between T₁ and T₂ is the entropy per mole:"
plot(c_p(T)/T, T: T_1 .. T_2, area: T_1 .. T_2, title: "c_p/T; the area is ΔS/n") | J/(mol·K^2)

## Heat supplied and mean temperature
"The heat supplied in heating at constant pressure (the source does not ask for it):"
Q := n·integral(c_p(T), T: T_1 .. T_2) | kJ
"The mean thermodynamic temperature of heating is the temperature at which the same heat would produce the same entropy change, Q = T_s·ΔS:"
T_s := Q/ΔS | K
T_arit := (T_1 + T_2)/2 | K

## Checks
check "The integral and the term-by-term calculation agree": abs(ΔS - ΔS_ruc) ≤ 0.001 J/K
check "Agreement with the source (820 J/K, rounded)": abs(ΔS - 820 J/K) ≤ 0.5 J/K
check "The mean temperature lies between T_1 and T_2": T_1 < T_s and T_s < T_2
check "The entropy rises (heating is reversible, ΔS > 0)": ΔS > 0 J/K
"The entropy of 1 kg of sulphate rises by about 820 J/K on heating. The third term of the heat capacity (with c) is negligible at these temperatures. The mean temperature of heating comes out somewhat below the arithmetic mean of the limits, because at lower temperatures the same heat gives a larger entropy increment."
