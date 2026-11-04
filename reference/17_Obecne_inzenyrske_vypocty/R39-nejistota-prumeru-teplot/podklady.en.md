# Uncertainty of a mean of repeated measurements

The theory behind the calculation, in our own words. Kalketa checks the formulas in the frames.

## The mean and its standard uncertainty

If the readings scatter independently and normally about an unknown value, the best estimate of the measurand is the arithmetic mean. Its standard uncertainty is the standard deviation of the mean: the sample standard deviation s divided by the square root of the number of measurements m (type A uncertainty according to GUM):

```kalk
x := [10.1, 10.3, 9.9, 10.2, 10.0] mm
u_x := stdev(x)/sqrt(len(x)) | mm
check "standard deviation of the mean": abs(u_x - 0.0707 mm) ≤ 0.0001 mm
```

## Expanded uncertainty and the Student distribution

Because s is only an estimate from a small number of measurements, the factor k = 2 of the normal distribution is not used; instead the quantile of the Student t distribution for ν = m − 1 degrees of freedom is. For 95 % coverage it is the quantile at level 0.975 (a two-sided interval, 2.5 % in each tail). For ν = 21 it gives k = 2.080, somewhat more than 2; as ν grows it approaches 1.96:

```kalk
check "k for ν = 21": abs(tinv(0.975, 21) - 2.0796) ≤ 0.0001
check "k for large ν": abs(tinv(0.975, 100000) - norminv(0.975)) ≤ 0.001
```

The expanded uncertainty is U = k·u and the coverage interval of the mean is t̄ − U to t̄ + U.

## Temperature units

The mean of temperatures in °C is a temperature; the standard deviation and the uncertainty are temperature differences in K. The interval t̄ ± U is therefore again in °C.
