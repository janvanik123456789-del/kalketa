# Uncertainty of the mean daily maximum temperature from 22 measurements
"After example E2 Surface Temperature of NIST Technical Note 1900 (A. Possolo, 2015): the daily maximum temperature read from a mercury maximum thermometer in a meteorological shelter on the NIST campus in May 2012, 22 days. The measurand is the average of the true daily maxima; the readings are independent and normally distributed about it. The calibration uncertainty of the thermometer is neglected. Task: estimate this average and the 95 % interval in which it lies."
"Source: A. Possolo: Simple Guide for Evaluating and Expressing the Uncertainty of NIST Measurement Results, NIST Technical Note 1900, 2015, https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1900.pdf (public work of the US government)"

## Given
table Kveten:
    | den | t [°C] {0.00} |
    | 1   | 18.75 |
    | 2   | 28.25 |
    | 3   | 25.75 |
    | 4   | 28.00 |
    | 7   | 28.50 |
    | 8   | 20.75 |
    | 9   | 21.00 |
    | 10  | 22.75 |
    | 11  | 18.50 |
    | 14  | 27.25 |
    | 15  | 20.75 |
    | 16  | 26.50 |
    | 17  | 28.00 |
    | 18  | 23.25 |
    | 21  | 28.00 |
    | 22  | 21.75 |
    | 23  | 26.00 |
    | 24  | 26.50 |
    | 25  | 28.00 |
    | 29  | 33.25 |
    | 30  | 32.00 |
    | 31  | 29.50 |

## Mean and standard deviation
m := len(Kveten.t)
t_avg := mean(Kveten.t)
s := stdev(Kveten.t)

## Standard and expanded uncertainty
u := s/sqrt(m)
ν := m - 1
k := tinv(0.975, ν)
U := k·u
t_low := t_avg - U
t_high := t_avg + U
"The 95 % coverage interval for the average maximum temperature is from t_low to t_high."
"Result: the average maximum temperature is (25.59 ± 1.81) °C, that is 23.8 to 27.4 °C, as in the source. The interval concerns the average, not individual days: those scatter from 18.5 to 33.3 °C."

## Chart
l_avg(d) := t_avg
l_low(d) := t_low
l_high(d) := t_high
plot(Kveten.t, l_avg(d), l_low(d), l_high(d), d: Kveten.den, title: "Daily maxima, mean and 95 % interval", xlabel: "day of May", ylabel: "t [°C]")
