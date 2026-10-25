# Prkno jako prostý nosník

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje jako odvození: tahle vrstva je zároveň ukázka toho, jak se do Podkladů píše teorie, kterou program hlídá.

![Prkno na dvou konzolách nese řadu knih jako rovnoměrné zatížení q](images/police.svg)

## Model

Prkno leží volně na dvou konzolách: konce se mohou pootočit, ale ne propadnout. Takový nosník se jmenuje **prostý**. Knihy stojí hustě vedle sebe, proto je bereme jako **rovnoměrné zatížení** q v newtonech na metr; patří k němu i vlastní tíha prkna.

## Ohybový moment

Každá konzola nese polovinu zatížení, q·L/2. Moment v místě x od levé konzoly je moment reakce minus moment zatížení nalevo od x:

```kalk
relation M == q·L/2·x - q·x^2/2
derive M == q·x·(L - x)/2
```

Největší je uprostřed. Dosazením x = L/2 vyjde známý vzorec:

```kalk
derive q·(L/2)·(L - L/2)/2 == q·L^2/8
```

## Napětí v ohybu

Ohyb prkno na jedné straně stlačuje a na druhé natahuje, nejvíc na povrchu. Napětí na povrchu je moment dělený průřezovým modulem W, a ten je moment setrvačnosti I dělený vzdáleností povrchu od středu, t/2:

```kalk
relation W == I/(t/2)
relation I == b·t^3/12
derive W == b·t^2/6
```

Tloušťka t je ve vzorci na druhou, šířka b jen lineárně: prkno na stojato je mnohem pevnější než naplocho.

## Průhyb

Křivost ohnutého prkna je úměrná momentu, w″ = −M/(E·I). Dvojí integrací s nulovým průhybem na obou konzolách vyjde průhybová čára; že je správná, ověří Kalketa derivací:

```kalk
derive derivative(q·x·(L^3 - 2·L·x^2 + x^3)/(24·E·I), x: x, order: 2) == -q·x·(L - x)/(2·E·I)
```

Uprostřed je průhyb největší:

```kalk
derive q·(L/2)·(L^3 - 2·L·(L/2)^2 + (L/2)^3)/(24·E·I) == 5·q·L^4/(384·E·I)
```

Rozpětí je ve vzorci na **čtvrtou**: o čtvrtinu delší police se prohne 2,4krát víc. Proto u polic skoro vždy rozhoduje průhyb, ne pevnost.

## Součinitele

- **k_mod = 0,6:** dřevo pod zatížením, které trvá roky, unese méně než při krátké zkoušce. Hodnota platí pro suchý interiér (třída provozu 1).
- **γ_M = 1,3:** rezerva na rozptyl vlastností rostlého dřeva (suky, vlákna).
- **1,35:** rezerva na zatížení stálé (knihy se na polici nechávají).
- **k_def = 0,6:** dotvarování, dřevo se pod trvalým zatížením postupně dál prohýbá; konečný průhyb je asi 1,6násobek počátečního.
- **L/300:** mez průhybu, pod kterou prohnutí na polici oko nepozná.
