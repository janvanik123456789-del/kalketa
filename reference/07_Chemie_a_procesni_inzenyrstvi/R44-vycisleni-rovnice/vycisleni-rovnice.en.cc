# Balancing the equation KMnO₄ + HCl and the amount of chlorine released
"Own task: potassium permanganate oxidises hydrochloric acid to chlorine, giving potassium chloride, manganese(II) chloride and water. We do not guess the coefficients by trial: for each element the atoms balance, and the coefficients are the solution of a system of equations. Then we find how much chlorine comes from 10 g of permanganate and how much acid it uses."
"Source: own task; molar masses from the IUPAC standard atomic weights (abridged values), verified by the mass balance (section 5 of the sheet) and independently in Python (Check in Python layer)."

## Input
"The equation: a KMnO₄ + b HCl → c KCl + d MnCl₂ + e Cl₂ + f H₂O. The acid is in excess, chlorine is taken as an ideal gas at standard conditions."
m_1 := 10 g              ' mass of the permanganate
T := 273.15 K
p := 101325 Pa
R_m := 8.314462618 J/(mol·K)

## Balance of elements
"The rows of the matrix are the elements K, Mn, O, H and Cl, the columns are the substances in the order of the equation. A number is the count of atoms of the element in one molecule, negative for the products. The coefficients form a vector that the matrix sends to zero."
A := [1, 0, -1, 0, 0, 0 | 1, 0, 0, -1, 0, 0 | 4, 0, 0, 0, 0, -1 | 0, 1, 0, 0, 0, -2 | 0, 1, -1, -2, -2, 0]
h := rank(A)
N := nullspace(A)
c := whole(N)
"The matrix has rank 5 with six unknowns, so the system has exactly one direction of solutions. whole turns it into the smallest whole numbers."

## Molar masses and the mass balance
M_1 := molar_mass("KMnO4")
M_2 := molar_mass("HCl")
M_3 := molar_mass("KCl")
M_4 := molar_mass("MnCl2")
M_5 := molar_mass("Cl2")
M_6 := molar_mass("H2O")
m_l := c[1]·M_1 + c[2]·M_2 | g/mol
m_p := c[3]·M_3 + c[4]·M_4 + c[5]·M_5 + c[6]·M_6 | g/mol

## Stoichiometry
"The amounts of substance are in the ratio of the coefficients."
n_1 := m_1/M_1 | mol
n_2 := n_1·c[2]/c[1] | mol
n_5 := n_1·c[5]/c[1] | mol
m_2 := n_2·M_2 | g
m_5 := n_5·M_5 | g
V_5 := n_5·R_m·T/p | l

## Checks
check "The number of atoms of each element is the same on both sides": max(abs(A·c)) == 0
check "Coefficients 2, 16, 2, 2, 5, 8": c[1] == 2 and c[2] == 16 and c[3] == 2 and c[4] == 2 and c[5] == 5 and c[6] == 8
check "The equation has a single balance": h == 5
check "Mass is conserved": abs(m_l - m_p) ≤ 0.001 g/mol
"The equation is 2 KMnO₄ + 16 HCl → 2 KCl + 2 MnCl₂ + 5 Cl₂ + 8 H₂O. 10 g of permanganate give 11.2 g of chlorine, about 3.5 l at standard conditions, and use 18.5 g of hydrogen chloride. Of the 16 molecules of HCl only 10 are oxidised to chlorine, the other 6 end up in the chlorides."
