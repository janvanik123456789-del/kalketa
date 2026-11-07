# Check of a triaxial state of stress by the HMH and Guest hypotheses
"Based on example 9.1 of the Czech textbook Elasticity and Strength (VŠB-TU Ostrava, R. Halama et al.). The components of the stress tensor at a point of a body are given. We find the principal stresses and from them the equivalent stress by the HMH hypothesis (distortion energy) and by Guest's hypothesis (maximum shear stress), and compare both with the allowable stress. The source does not say how to number the principal stresses; we use the order σ₁ ≤ σ₂ ≤ σ₃ (smallest, middle, largest). The drawings are our own."
"Source: R. Halama et al.: Pružnost a pevnost, VŠB-TU Ostrava, https://mi21.vsb.cz/sites/mi21.vsb.cz/files/unit/pruznost_a_pevnost.pdf"

## Input
σ_x := 80 MPa         ' normal stress in direction x
σ_y := 20 MPa         ' normal stress in direction y
σ_z := -15 MPa        ' normal stress in direction z (compression)
τ_xy := 40 MPa        ' shear stress in the xy plane
τ_yz := 0 MPa
τ_zx := 0 MPa
σ_DOV := 112 MPa      ' allowable stress
![Stress element with σ_x, σ_y, σ_z and τ_xy, and the three Mohr circles of the triaxial state](images/mohr.en.svg){width=90%}

## Principal stresses
"The principal stresses are the eigenvalues of the stress tensor, that is the roots of det(T − σ·E) = 0:"
T := [σ_x, τ_xy, τ_zx | τ_xy, σ_y, τ_yz | τ_zx, τ_yz, σ_z]
σ := eigenvals(T)
"The same as on paper: since τ_yz = τ_zx = 0, σ_z is a principal stress and the other two come from the plane stress in the xy plane:"
σ_23 := (σ_x + σ_y)/2 ± sqrt((σ_x - σ_y)^2/4 + τ_xy^2)
σ_1 := min(σ)
σ_3 := max(σ)
σ_2 := sum(σ) - σ_1 - σ_3
"The source numbers the same stresses differently (−15, 100, 0 MPa); this does not change the result, both formulas below are symmetric."

## Mohr circles
"The three circles have diameters equal to the differences of the principal stresses; the maximum shear stress is the radius of the largest one:"
τ_12 := abs(σ_1 - σ_2)/2
τ_23 := abs(σ_2 - σ_3)/2
τ_31 := abs(σ_3 - σ_1)/2
τ_max := max(τ_12, τ_23, τ_31)

## Equivalent stresses
"HMH hypothesis: the equivalent stress is the uniaxial stress with the same distortion energy as the given state of stress:"
σ_RED_HMH := sqrt(σ_1^2 + σ_2^2 + σ_3^2 - σ_1·σ_2 - σ_2·σ_3 - σ_3·σ_1) {eq}
"Guest's hypothesis: the maximum shear stress decides, the equivalent stress is twice its value:"
σ_RED_GUEST := max(abs(σ_1 - σ_2), abs(σ_2 - σ_3), abs(σ_3 - σ_1)) {eq}
"An independent check of HMH without the principal stresses, directly from the tensor components (valid for any components):"
σ_RED_HMH2 := sqrt(σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x + 3·(τ_xy^2 + τ_yz^2 + τ_zx^2))
"Utilization of the allowable stress:"
v_HMH := σ_RED_HMH/σ_DOV | %
v_GUEST := σ_RED_GUEST/σ_DOV | %

## Checks
check "HMH equivalent stress (the same directly from the components)": σ_RED_HMH ≤ σ_DOV and abs(σ_RED_HMH - σ_RED_HMH2) ≤ 0.001 MPa
check "Guest equivalent stress": σ_RED_GUEST ≤ σ_DOV

## How the check depends on the shear stress
"We keep the other components and vary only the shear stress τ to see when each hypothesis fails. Both equivalent stresses as functions of τ (the principal stresses in the xy plane are a and b, the third is still σ_z):"
σ_HMH(τ) := sqrt(σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x + 3·τ^2)
a(τ) := (σ_x + σ_y)/2 + sqrt((σ_x - σ_y)^2/4 + τ^2)
b(τ) := (σ_x + σ_y)/2 - sqrt((σ_x - σ_y)^2/4 + τ^2)
σ_GUEST(τ) := max(abs(a(τ) - b(τ)), abs(b(τ) - σ_z), abs(σ_z - a(τ)))
plot(σ_HMH(τ), σ_GUEST(τ), τ: 0 MPa .. 60 MPa, title: "Equivalent stresses against the shear stress τ_xy") | MPa
"The largest shear stress the state can still carry. For HMH it follows from σ_HMH = σ_DOV; for Guest the difference a − σ_z (largest minus smallest principal stress) decides:"
τ_dov_HMH := sqrt((σ_DOV^2 - (σ_x^2 + σ_y^2 + σ_z^2 - σ_x·σ_y - σ_y·σ_z - σ_z·σ_x))/3) | MPa
τ_dov_GUEST := sqrt((σ_DOV + σ_z - (σ_x + σ_y)/2)^2 - ((σ_x - σ_y)/2)^2) | MPa
check "The given shear stress is below the HMH limit but above the Guest limit": τ_dov_GUEST < τ_xy and τ_xy < τ_dov_HMH
"Guest's hypothesis is stricter: it never gives less than HMH, so it allows a smaller shear stress (about 36 MPa against 43 MPa). The given τ_xy = 40 MPa lies between them."
"So the state passes by HMH (utilization 96.7 %) but fails by Guest (102.7 %). Which check to use is set by the standard or the material: HMH fits ductile metals better, Guest is the safer estimate."
