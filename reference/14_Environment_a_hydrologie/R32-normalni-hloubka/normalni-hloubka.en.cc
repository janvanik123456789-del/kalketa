# Roughness and normal depth in a trapezoidal channel (Manning)
"After the lecture notes Fluid Mechanics, chapter 8 Open Channel Flow (University of Mustansiriyah), worked examples 3 and 4. A trapezoidal channel with a bottom width of 8 m and side slopes 1 : 1.5 carries 56 m³/s, the bed slope is 0.0009. First, from the depth of 2 m measured at this flow, we determine Manning’s roughness coefficient. Then for the roughness 0.017 we find the normal depth at which the flow is uniform. The drawing of the cross section is our own."
"Source: https://www.uomus.edu.iq/img/lectures21/MUCLecture_2024_41752170.pdf"

## Input
b := 8 m                      ' bottom width
m_s := 1.5                    ' side slope 1 : m_s
I_0 := 0.0009                 ' longitudinal bed slope
Q := 56 m^3/s
![Trapezoidal cross section of the channel: bottom width b, depth y, side slopes 1 : m_s, width at the water surface b + 2·m_s·y](images/koryto.svg){width=70%}
"Flow area, wetted perimeter and hydraulic radius as functions of the depth:"
S_p(y) := (b + m_s·y)·y
O_p(y) := b + 2·y·sqrt(1 + m_s^2)
R_h(y) := S_p(y)/O_p(y)

## Roughness from the measured depth (example 3)
y_1 := 2 m
R_1 := R_h(y_1) | m
"Manning’s equation Q = S·R^(2/3)·√I/n, solved for n:"
n_1 := S_p(y_1)·R_1^(2/3)·sqrt(I_0)/Q | s/m^(1/3) {eq}
"Source: n = 0.01507."

## Normal depth for n = 0.017 (example 4)
n := 0.017 s/m^(1/3)
"The normal depth is the one at which Manning’s equation gives the specified flow:"
solve y_n: S_p(y_n)·R_h(y_n)^(2/3)·sqrt(I_0)/n == Q in 0.5 m .. 5 m
v := Q/S_p(y_n) | m/s
"Source, by trial and error: 2.137 m. A channel with higher roughness (0.017 against 0.0151) needs a larger depth to carry the same flow."
"Rating curve of the channel, the flow in uniform flow as a function of the depth:"
Q_y(y) := S_p(y)·R_h(y)^(2/3)·sqrt(I_0)/n
plot(Q_y(y), y: 0.2 m .. 3 m, title: "Rating curve of the channel (n = 0.017)") | m^3/s
