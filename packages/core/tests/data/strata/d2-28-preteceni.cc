# Přetečení a podtečení

"Matematicky je e¹⁰⁰⁰ konečné, ale do dvojné přesnosti se vejde nejvýš 1,8·10³⁰⁸."
preteceni := exp(1000)
"Matematicky je e⁻¹⁰⁰⁰ kladné, ale pod 10⁻³⁰⁸ už program nedrží – očekává se varování."
podteceni := exp(-1000)
