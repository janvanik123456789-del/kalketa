# Splácení úvěru

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje.

## Odkud je vzorec pro splátku

Peníze mají v čase různou hodnotu. Splátka zaplacená za k měsíců má dnes hodnotu pay/(1 + r)^k, kde r je úrok za jeden měsíc. Úvěr je splacený, když se součet dnešních hodnot všech splátek rovná půjčené částce. Je to geometrická řada a její součet dává

P = pay·(1 − (1 + r)^(−n))/r

Odtud se vyjádří splátka. Dosazení zpátky musí vrátit úvěr:

```kalk
P := 300000 Kč
r := 0.005
n := 36
pay := P·r/(1 - (1 + r)^(-n))
Z := pay·(1 - (1 + r)^(-n))/r
check "Současná hodnota splátek je úvěr": abs(Z - P) ≤ 0.01 Kč
```

## Proč se úrok postupně zmenšuje

V každém měsíci platí B_k = B_(k−1)·(1 + r) − pay. Úrok se počítá jen ze zbývajícího dluhu, takže s klesajícím dluhem klesá. Splátka je pořád stejná, a proto na úmor připadá stále víc. Úmory rostou geometricky s kvocientem (1 + r).

## Roční sazba a efektivní sazba

Sazba 6 % ročně při měsíčním úročení znamená 0,5 % za měsíc. Protože se úrok úročí dál, za rok naroste dluh bez splácení o víc než 6 %, konkrétně o (1 + r)^12 − 1. Skutečný náklad úvěru navíc zvyšují poplatky, které tento výpočet neuvažuje. Ty zahrnuje až RPSN.

## Tabulka, která čte sama sebe

Sloupec tabulky může číst předchozí řádek: `prev(B, P)` je hodnota sloupce `B` o řádek výš, v prvním řádku `P`. Stejným způsobem jde zapsat i další postupy, kde každý krok navazuje na předchozí, například zůstatek s jinou sazbou od určitého měsíce. Stačí sazbu vyjádřit pomocí čísla řádku `k`, třeba `if(k ≤ 12, r, r_2)`.
