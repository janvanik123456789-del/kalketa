# Dávka 5 – list 09: binopdf a poisspdf pro velká n a lambda; nchoosek(1000, 500)
b1 := binopdf(5000, 10000, 0.5)
b2 := binopdf(4999, 10000, 0.5)
b3 := binopdf(10000, 10000, 0.5)   ' = 0.5^10000
b4 := binopdf(0, 10000, 0.5)
b5 := binopdf(5000, 10000, 0.5) / binopdf(4999, 10000, 0.5)
p1 := poisspdf(500, 500)
p2 := poisspdf(499, 500)
p3 := poisspdf(0, 500)             ' = exp(-500)
p4 := poisspdf(1500, 500)
n1 := nchoosek(1000, 500)
n2 := nchoosek(10000, 5000)        ' mimo dosah double -> jak se oznami?
