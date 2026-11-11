# 21 — rekurentní tabulka: splácení úvěru počítané po řádcích
# Reference: uzavřený vzorec anuitní půjčky ve zlomcích / mpmath.

urok := 0.02
P := 100000
splatka := 3000
pocet := 6

table Spl: {rows=1..pocet}
    | k | U = prev(B, P)·urok | B = prev(B, P)·(1 + urok) - splatka |

radek := Spl.B
úroky := Spl.U
soucet_uroku := sum(Spl.U)
posledni_zustatek := Spl.B[6]

rust := (1 + urok)^pocet
zustatek_vzorec := P·rust - splatka·(rust - 1) / urok
uroky_vzorec := splatka·pocet - (P - zustatek_vzorec)

s_meritkem := 1200 EUR
s_typer := 0.03
table Muc: {rows=1..4}
    | n | Z = prev(Z, s_meritkem)·(1 + s_typer) - 350 EUR |

check "zustatek podle uzavřeného vzorce": abs(posledni_zustatek / zustatek_vzorec - 1) < 1e-12
check "součet úroků sedí": abs(soucet_uroku / uroky_vzorec - 1) < 1e-12
check "první úrok je od počátečního dluhu": abs(Spl.U[1] / (P·urok) - 1) < 1e-15
check "rekurence s jednotkami": abs(Muc.Z[4] / (-113.658878 EUR) - 1) < 1e-12
