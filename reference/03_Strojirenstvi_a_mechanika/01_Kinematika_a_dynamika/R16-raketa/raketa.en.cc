# Rocket: greatest fuel consumption at an overload of 7 g, burn time and final velocity
"After problem 2311 of a Czech collection of solved physics problems (reseneulohy.cz/2311; originally a set of problems in mechanics, Charles University 1994). A rocket of mass 2 t carries 12 t of fuel, the engine expels exhaust gas at a speed of 5000 km/h relative to the rocket. The crew can bear an acceleration of at most 7 g. What is the greatest fuel consumption per second, how long does the engine burn at it and what velocity does the rocket finally reach? The rocket starts vertically, we neglect air resistance and take the gravitational acceleration as constant. The theory (the Meshchersky and Tsiolkovsky equations) is in the Sources layer. The picture and the graphs are our own."
"Source: Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994, https://reseneulohy.cz/2311"

## Data
M_r := 2 t                ' mass of the rocket without fuel
M_p := 12 t               ' mass of the fuel
v_R := 5000 km/h | m/s    ' exhaust velocity relative to the rocket
n := 7                    ' greatest permitted acceleration as a multiple of g
g := 9.81 m/s^2           ' gravitational acceleration
![A rocket starting vertically upward: thrust of the engine upward, weight downward, exhaust gas flowing out downward at the exhaust velocity v_R](images/raketa.en.svg){width=55%}

## Greatest fuel consumption per second
"The Meshchersky equation (see Sources) for a rocket starting vertically upward, positive direction up. The mass m of the rocket with fuel decreases, dm is negative:"
relation m·dv/dt == -m·g - v_R·dm/dt {eq}
"Acceleration of the rocket:"
derive dv/dt == -v_R·dm/(m·dt) - g {eq}
"The fuel burns at a constant consumption per second q, so the mass decreases uniformly. The acceleration grows as the rocket gets lighter and is greatest just before the fuel runs out, when only the rocket remains (m = M_r). There it may reach n·g:"
relation dm/dt == -q {eq}
relation m == M_r {eq}
relation dv/dt == n·g {eq}
derive q == (n + 1)·g·M_r/v_R
q_max := (n + 1)·g·M_r/v_R | kg/s {eq}

## Burn time of the engine
"All the fuel burns in the time"
τ := M_p/q_max | s {eq}

## Final velocity of the rocket
"Mass of the rocket and its acceleration at time t from the start:"
m_t(t) := M_r + M_p - q_max·t
a_t(t) := v_R·q_max/m_t(t) - g
"The final velocity is the sum of all increments of velocity during the burn. The integral gives the Tsiolkovsky equation with gravity loss (see Sources):"
v_max := integral(a_t(t), t: 0 s .. τ) == v_R·ln((M_r + M_p)/M_r) - g·τ == v_R·ln((M_r + M_p)/M_r) - M_p·v_R/((n + 1)·M_r) | km/h {eq}

## Course of the flight
v_t(t) := v_R·ln((M_r + M_p)/m_t(t)) - g·t
plot(a_t(t)/g, t: 0 s .. τ, title: "Acceleration of the crew as a multiple of g")
plot(v_t(t), t: 0 s .. τ, title: "Velocity of the rocket") | km/h
"At the start the thrust of the engine only slightly exceeds the weight of the full rocket, so the rocket rises slowly:"
F_t := q_max·v_R | kN
G_0 := (M_r + M_p)·g | kN
check "the thrust lifts the full rocket": F_t > G_0
a_0 := a_t(0 s) | m/s^2
"Height at which the engine burns out:"
h_k := integral(v_t(t), t: 0 s .. τ) | km
