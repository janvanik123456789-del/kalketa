# Controller tuning by the critical gain method (Ziegler–Nichols)
"After the page Ziegler–Nichols method on picuino.com, the example of the critical gain method: temperature control of a simulated furnace. The controller is first set as purely proportional and its gain is raised until the controlled temperature starts to oscillate with constant amplitude. From this critical gain and the period of the oscillation the rules of the table give the constants of the controllers P, PI, PD and PID. Each type of controller is one variant of the calculation, the comparison is at the end. The diagram of the control loop is our own."
"Source: C. F. Pardo Martín, https://www.picuino.com/en/control-ziegler-nichols.html"

## Test at the limit of stability
"At K_p = 0.40 the oscillations died out, at 0.45 they grew. Sustained oscillation occurred at the gain 0.43 and four periods of the oscillation took 21 s."
K_c := 0.43                   ' critical gain
T_c := 21 s/4                 ' period of the critical oscillation
![Control loop: setpoint temperature, PID controller, furnace and temperature feedback; at the critical gain the temperature oscillates with period T_c](images/smycka.en.svg){width=85%}

## Tuning rules
"The controller constants are multiples of the critical gain and the period. The table of the source for a controller of the form u = K_p·e + K_i·∫e dt + K_d·de/dt:"
table Regulator: {variants=PID}
    | typ | a_p  | a_i  | a_d   |
    | P   | 0.50 | 0    | 0     |
    | PI  | 0.45 | 0.54 | 0     |
    | PD  | 0.80 | 0    | 0.075 |
    | PID | 0.59 | 1.18 | 0.075 |
K_p := a_p·K_c {eq}
K_i := a_i·K_c/T_c | s^-1 {eq}
K_d := a_d·K_c·T_c | s {eq}

## Comparison of the controller types
porovnani := compare(Regulator, K_p, K_i, K_d)
"The source writes the period as 5.3 s. The derivative constants (0.169) are calculated with the exact value 21/4 = 5.25 s, the integral ones (0.096 for PID) with the rounded 5.3 s; with 5.25 s K_i = 0.0966 s⁻¹. The proportional constant of PI comes out 0.1935, the source gives 0.195."
"The integral part removes the permanent control error of the P controller, the derivative part damps the oscillation. That is why PD and PID have a greater proportional gain than P and PI."
