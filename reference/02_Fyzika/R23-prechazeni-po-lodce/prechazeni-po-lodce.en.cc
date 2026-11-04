# Shift of a boat when a man walks from the stern to the bow
"After problem 1136 of a Czech collection of solved physics problems (reseneulohy.cz/1136; originally a set of problems in mechanics for teacher training, Faculty of Mathematics and Physics, Charles University, 1994). A man of mass 70 kg walks from the stern to the bow of a boat that is 2.5 m long and weighs 100 kg. By how much does the boat shift? We neglect the resistance of the water and the tilting of the boat. The picture is our own."
"Source: D. Mandíková, M. Rojko: Soubor úloh z mechaniky pro studium učitelství, MFF UK 1994, https://reseneulohy.cz/1136"

## Data
m := 70 kg            ' mass of the man
M := 100 kg           ' mass of the boat
L := 2.5 m            ' length of the boat
![The man walks from the stern to the bow, the centre of mass T of the system stays in place and the boat shifts by x](images/lodka.en.svg){width=80%}

## Analysis
"On the boat–man system only the weight and the buoyancy act from outside, and they cancel. The boat is pushed by the friction of the shoes on the floor, but that is a force inside the system. The resultant of the external forces is therefore always zero and the centre of mass of the system, at rest at the start, stays at rest (Newton's 1st law). We express the position of the centre of mass before and after the walk and set the two equal. The whole mass of the boat and of the man is concentrated in their centres of mass."

## Solution
"The x axis runs along the water surface, the origin is at the bow of the boat before the walk, the positive direction towards the stern. Before the walk the centre of mass of the boat is at half of its length and the man stands at the stern:"
relation x_T1 == (M·L/2 + m·L)/(M + m) {eq}
"After the walk the bow of the boat is shifted by x, the centre of mass of the boat is at x + L/2 and the man stands at the bow:"
relation x_T2 == (m·x + M·(x + L/2))/(M + m) {eq}
"The centre of mass has not moved:"
relation x_T1 == x_T2 {eq}
derive x == m·L/(M + m) {eq}
"In numbers:"
x := m·L/(M + m) | m
"Check by substitution: the centre of mass is at the same place before and after the walk."
x_T1 := (M·L/2 + m·L)/(M + m) | m
x_T2 := (m·x + M·(x + L/2))/(M + m) | m
check "The centre of mass stayed in place": abs(x_T2 - x_T1) ≤ 1e-9 m

## What happens on the way
"Relative to the water the man does not walk the whole length of the boat, only the rest of it; the boat slides away under his feet in the opposite direction. The product of mass and shift is the same for both, otherwise the centre of mass would move:"
s_c := L - x | m
check "The shifts of the man and of the boat balance": abs(m·s_c - M·x) ≤ 1e-9 kg·m
"When the man has walked a distance s along the boat, the boat is shifted in proportion to it; position of the bow and of the man relative to the water:"
x_p(s) := m·s/(M + m)
x_c(s) := L - s + x_p(s)
plot(x_p(s), x_c(s), s: 0 m .. L, title: "Position of the bow and of the man relative to the water") | m
"The lighter the boat, the farther it travels: a very light one would shift almost by its whole length, a very heavy one hardly at all."
x_M(M_l) := m·L/(M_l + m)
plot(x_M(M_l), M_l: 10 kg .. 1000 kg, title: "Shift of the boat as a function of its mass") | m
