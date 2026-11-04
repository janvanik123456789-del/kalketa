# Natural frequencies, mode shapes and free vibration of a two-mass system
"After the examples of lecture 4 of the course 53/58:153 Fundamentals of Vibration (University of Iowa, S. Xiao). Two masses on a line, joined between walls by three springs: wall – k_1 – m_1 – k_2 – m_2 – k_3 – wall. Problem: find the natural frequencies and mode shapes, then the free vibration when the first mass is displaced by 1 and released. The source gives no units; we take the masses in kilograms, newtons per metre and metres. The solution in the source is only in pictures, so it was verified separately (eigenvalues in Python and by hand from a quadratic equation). The theory is in the Sources layer."
"Source: https://user.engineering.uiowa.edu/~sxiao/class/058-153/lecture-4.pdf"

## Input
m_1 := 9 kg
m_2 := 1 kg
k_1 := 38 N/m
k_2 := 2 N/m
k_3 := 3 N/m
y_10 := 1 m                 ' initial displacement of the first mass
![Two masses between walls joined by three springs; displacements y₁ and y₂ from the equilibrium position](images/hmoty.svg){width=75%}

## Equations of motion
"For each mass: the inertial force and the forces of the springs acting on it (Newton's second law, see Sources). In matrix form M·ÿ + K·y = 0:"
M := [m_1, 0 kg | 0 kg, m_2]
K := [k_1 + k_2, -k_2 | -k_2, k_2 + k_3]

## Natural frequencies
"The harmonic solution y = φ·cos(ω·t) gives the condition det(K − ω²·M) = 0, a quadratic equation for Ω = ω²:"
solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0
"The same as the eigenvalues of the generalized problem K·φ = Ω·M·φ:"
Ω_v := eigenvals(K, M)
ω_1 := sqrt(Ω_v[1]) | rad/s
ω_2 := sqrt(Ω_v[2]) | rad/s
f_1 := ω_1/(2·π) | Hz
f_2 := ω_2/(2·π) | Hz

## Mode shapes
"Eigenvectors (columns, the largest element 1): the ratio of the displacements of the two masses in each mode."
Φ := eigenvecs(K, M)
r_1 := Φ[2, 1]/Φ[1, 1]
r_2 := Φ[2, 2]/Φ[1, 2]
"In the first mode both masses move in the same direction, the lighter second one twice as much; in the second they move against each other. The higher frequency belongs to the mode with a change of direction."

## Free vibration from an initial displacement
"The solution is the sum of both modes, y(t) = C_1·φ_1·cos(ω_1·t) + C_2·φ_2·cos(ω_2·t) (the initial velocities are zero). The amplitudes C follow from the initial displacements y(0) = [y_10, 0]:"
C := lsolve(Φ, [y_10, 0 m])
y_1(t) := C[1]·Φ[1, 1]·cos(ω_1·t) + C[2]·Φ[1, 2]·cos(ω_2·t)
y_2(t) := C[1]·Φ[2, 1]·cos(ω_1·t) + C[2]·Φ[2, 2]·cos(ω_2·t)
plot(y_1(t), y_2(t), t: 0 s .. 60 s, samples: 800, title: "Displacements of both masses: beats") | m
"The frequencies are close, so the energy flows between the masses in beats; their period is:"
T_r := 2·π/(ω_2 - ω_1) | s
