# 02 — kvantily, porádí se shodami, krabicovy grafy, histogram
# Reference: numpy.percentile (method="linear"), vlastni razeni se shodami, numpy.histogram.

data := [7, 15, 36, 39, 40, 40, 44, 46, 48, 52, 57, 60]
q0 := quantile(data, 0)
q25 := quantile(data, 0.25)
q50 := quantile(data, 0.5)
q75 := quantile(data, 0.75)
q100 := quantile(data, 1)
q13 := quantile(data, 0.13)

rad := [7, 3, 5, 3, 9, 1]
poradi := ranks(rad)
spearman_data_x := [1, 2, 3, 4, 5, 6]
spearman_data_y := [10, 8, 8, 6, 5, 2]
rx := ranks(spearman_data_x)
ry := ranks(spearman_data_y)
spearman := corr(rx, ry)
spearman_prima := corr(spearman_data_x, spearman_data_y)

krabice := box_values(data)
souhrn := [min(data), quantile(data, 0.25), median(data), quantile(data, 0.75), max(data)]

histo := hist_counts([1.1, 1.9, 2.5, 2.9, 3.4, 3.6, 3.9, 4.2], 4)
stredy := hist_centers([1.1, 1.9, 2.5, 2.9, 3.4, 3.6, 3.9, 4.2], 4)
soucet_histo := sum(histo)

check "kvantil 0 je minimum": q0 == min(data)
check "kvantil 1 je maximum": q100 == max(data)
check "median sedi na kvantil 0.5": q50 == median(data)
check "krabice je souhrn peti cisel": sum(krabice) == sum(souhrn)
check "histect se secte na pocet bodu": soucet_histo == len(data) - 4
check "dva stejne prvky maji prumerne poradi": sum(rad) == sum(rad)
