# Measurement uncertainty: swing time of a pendulum and cross section of a wire
"After the collection Errors and uncertainties of measurement – examples (CTU in Prague, Faculty of Mechanical Engineering, in Czech), worked examples 1 and 4. First the swing time of a torsional pendulum from repeated measurement with a stopwatch: type A uncertainty from the scatter of the measurements, type B from the accuracy of the stopwatch, and their combination. Then the cross section of a wire from a single measurement with a micrometer: how the uncertainty of the diameter carries over to the area. The picture is our own."
"Source: Z. Budinská: Chyby a nejistoty měření – příklady, ČVUT v Praze, Fakulta strojní, https://www.fs.cvut.cz/content/files/12102/2024nejistotypriklady.pdf"

## Swing time of a torsional pendulum (example 1)
"With a mechanical stopwatch the time after the fourth oscillation, that is after eight swings, was read five times:"
t_i := [18.60, 18.55, 18.60, 18.70, 18.65] s
N_k := 8
![Torsional pendulum: a disc on a wire oscillates about a vertical axis; one oscillation is two swings](images/kyvadlo.en.svg){width=45%}
T_k := mean(t_i)/N_k | s {eq}
"The type A uncertainty is the standard deviation of the mean, converted to one swing:"
u_A := stdev(t_i)/sqrt(len(t_i))/N_k | s {eq}
"The type B uncertainty from the stopwatch: reading and reaction error of about 0.3 s with a uniform distribution, again per swing:"
Δ_t := 0.3 s
u_B := Δ_t/(N_k·sqrt(3)) | s {eq}
u_c := sqrt(u_A^2 + u_B^2) | s {eq}
"Result: T_k = (2.328 ± 0.022) s. The source rounds u_B to 0.022 s and the combined uncertainty up to 0.023 s. The uncertainty of the stopwatch prevails: repeating the measurement would improve the result only a little."

## Cross section of a wire (example 4)
d := 0.81 mm                  ' diameter measured with a micrometer
Δ_d := 0.01 mm                ' smallest division of the micrometer
S_d := π·d^2/4 | mm^2 {eq}
"It was measured once, so the uncertainty is of type B only. The relative uncertainty of the area is twice the relative uncertainty of the diameter, because the diameter is squared in the formula:"
u_d := Δ_d/sqrt(3) | mm
u_rS := 2·u_d/d | % {eq}
u_S := S_d·u_rS | mm^2 {eq}
"Result: S = (0.5153 ± 0.0074) mm², relatively 1.4 %, as in the source."
