# Posun loďky, když člověk přejde ze zádi na příď
"Podle úlohy 1136 Sbírky řešených úloh z fyziky (reseneulohy.cz/1136; původně D. Mandíková, M. Rojko: Soubor úloh z mechaniky pro studium učitelství, MFF UK 1994). Člověk o hmotnosti 70 kg přejde ze zádi na příď loďky, která je dlouhá 2,5 m a váží 100 kg. O kolik se loďka posune? Odpor vody a naklonění loďky zanedbáme. Obrázek je vlastní."

## Zápis
m_c := 70 kg              ' hmotnost člověka
M := 100 kg             ' hmotnost loďky
L_l := 2.5 m              ' délka loďky
![Člověk přejde ze zádi na příď, těžiště T soustavy zůstane na místě a loďka se posune o x](images/lodka.svg){width=80%}

## Rozbor
"Na soustavu loďka–člověk působí zvenku jen tíhová a vztlaková síla a ty se vyruší. Loďku posouvá tření bot o dno, to je ale síla uvnitř soustavy. Výslednice vnějších sil je proto stále nulová a těžiště soustavy, na začátku v klidu, v klidu zůstane (1. Newtonův zákon). Polohu těžiště vyjádříme před přechodem a po něm a obě položíme sobě rovné. Celou hmotnost loďky i člověka soustředíme do jejich těžišť."

## Řešení
"Osa x vede po hladině, počátek je na přídi loďky před přechodem, kladný směr k zádi. Před přechodem je těžiště loďky v polovině její délky a člověk stojí na zádi:"
relation x_T1 == (M·L_l/2 + m_c·L_l)/(M + m_c) {eq}
"Po přechodu je příď loďky posunutá o x, těžiště loďky je v x + L/2 a člověk stojí na přídi:"
relation x_T2 == (m_c·x + M·(x + L_l/2))/(M + m_c) {eq}
"Těžiště se nepohnulo:"
relation x_T1 == x_T2 {eq}
derive x == m_c·L_l/(M + m_c) {eq}
"Číselně:"
x := m_c·L_l/(M + m_c) | m
"Kontrola dosazením: těžiště je před přechodem i po něm na stejném místě."
x_T1 := (M·L_l/2 + m_c·L_l)/(M + m_c) | m
x_T2 := (m_c·x + M·(x + L_l/2))/(M + m_c) | m
check "Těžiště zůstalo na místě": abs(x_T2 - x_T1) ≤ 1e-9 m

## Co se děje cestou
"Člověk vůči vodě neujde celou délku loďky, jen její zbytek; loďka mu ujíždí pod nohama na druhou stranu. Součin hmotnosti a posunutí je pro oba stejný, jinak by se těžiště pohnulo:"
s_c := L_l - x | m
check "Posunutí člověka a loďky se vyváží": abs(m_c·s_c - M·x) ≤ 1e-9 kg·m
"Když člověk ujde po loďce vzdálenost s, je loďka posunutá úměrně tomu; poloha přídě a člověka vůči vodě:"
x_p(s) := m_c·s/(M + m_c)
x_c(s) := L_l - s + x_p(s)
plot(x_p(s), x_c(s), s: 0 m .. L_l, title: "Poloha přídě a člověka vůči vodě") | m
"Čím je loďka lehčí, tím víc ujede: velmi lehká by se posunula skoro o celou délku, velmi těžká skoro vůbec."
x_M(M_l) := m_c·L_l/(M_l + m_c)
plot(x_M(M_l), M_l: 10 kg .. 1000 kg, title: "Posun loďky podle její hmotnosti") | m
