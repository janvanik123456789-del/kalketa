# Výběr příkladů podle toho, co prověří (2026-11-04)

Prošlo se všech 49 PDF, 37 HTML stránek, oba datasety (TheoremQA 800 úloh, MathQA 29 837 úloh v zipu), složka `prevod` a `Testovaci_priklady`. Vzniklo 165 kandidátů. Tady je výběr seřazený tak, aby každá etapa připravila další. Podrobnosti ke každému kandidátovi, zkušební listy a seznam chyb ve zdrojích jsou v `priklady-podklady/vyber/` (zprávy `<obor>.md`, listy `sondy/`).

Označení kandidátů odpovídá těm zprávám: `elektrotechnika-3` je řádek 3 ve zprávě `elektrotechnika.md`.

## Hlavní zjištění

- **Běžné inženýrské úlohy Kalketa zvládá.** V pružnosti a pevnosti a v chemii sedí téměř všechny zkoušené úlohy na vytištěný výsledek. Přidávat další podobné vzory limity nenajde.
- **Největší riziko jsou tiše špatná čísla**, ne chybějící funkce. Proto jsou první etapou.
- **Několik mezer se objevilo nezávisle ve více oborech**, takže jejich oprava pomůže nejvíc: funkce na řadách, `solve` uvnitř funkce, soustavy diferenciálních rovnic, předchozí řádek tabulky, komplexní čísla, řazení a kvantily.

## Etapa 0: tiše špatné nebo zavádějící výsledky

Nezávisí na ničem a má přednost před vším. Každý bod je ověřený krátkým listem (`priklady-podklady/vyber/overeni/`).

| # | Co se stane | Správně | Prověří kandidát |
|---|---|---|---|
| 0.1 | `d := 3/8 in` dá 14,76 1/m bez varování | 3/8 palce, nebo aspoň upozornění | `strojni-casti-1` (kotlový nýtový spoj, Leutwiler) |
| 0.2 | `solve x: tan(x) + tanh(x) == 0 in 0.1 .. 3` dá 1,571 (pól tangenty) | 2,365 | `datasety-1` |
| 0.3 | Rovnice `(y-1)²·y′ == 2x+3`, `y(1) == 4`: y(0) = −0,0003 | 3,466 | `datasety-2` |
| 0.4 | Dlouhá tlumená rovnice: y(5 ms) = −2,838 mA, o 7 % mimo (pevně 200 kroků) | −2,648 mA | `elektrotechnika-8` (RLC, Feld 4.10) |
| 0.5 | Úzký zatěžovací impulz v rovnici: −0,1185 mm | −0,1544 mm | `stavebni-statika-3` (`statika-3`) |
| 0.6 | `roots(x² + 2x + 101, x)` se vypíše `[-1, -1]`, `[1, 2]·1j` jako `[0, 0]`: imaginární část se ve výpisu ztrácí | `[−1+10j, −1−10j]` | `elektrotechnika-6`, `termodynamika-4` |
| 0.7 | Vypsaný vzorec proložení s osou v °C má u posunu opačné znaménko (`+ 2 °C`, hodnota je −2) | `− 2 °C` | `statistika-mereni-12` (termistor, NIST E7) |
| 0.8 | `44^(-1e5)` dá 0 bez varování, kdežto přetečení hlásí chybu | varování | `termodynamika-2` |
| 0.9 | `solve T` v kelvinech vrátí rozdíl: `T | °C` = 200 Δ°C a `T - T_0` se odmítne | teplota, −73,15 °C | `termodynamika-3` (papiňák), `datasety-12` (kalorimetrie) |
| 0.10 | V tabulce se proměnná jménem jednotky čte jako jednotka: `g` je gram, `C` coulomb | proměnná, jako mimo tabulku | `datasety-17`, `Vytok_z_nadrze_zadani_7` |
| 0.11 | `{decimals=6}` na řadě nic neudělá: `[10,000172; 10,000116] V` se vypíše `[10, 10] V`; matice a čísla bez jednotky se tisknou na 4 číslice | požadovaná přesnost | `statistika-mereni-9`, `ekonomika-3` |
| 0.12 | `solve` s funkcí listu a `== 0` nenajde řešení, se stejnými rovnicemi rozepsanými ano; `npv` v `solve` s `guess` selže, s intervalem funguje | a = 3,8; b = −7,2 / 0,1524 | `stavebni-statika-7`, `ekonomika-7` |
| 0.13 | Drobné: `1/sqrt(L·C)` se vypíše v Hz místo rad/s; `| hp` v těle funkce se při volání ztratí; `1/√x` od nuly hlásí nepřesnost | rad/s; hp; bez varování | `elektrotechnika-17`, `strojni-casti-5`, `datasety-16` |

Levné k tomu: jednotky `dkg`, `psia`, `psig`, `torr`, `Da`, `u`, `Å`, `eq`, `meq`, `dB`, `dBm`, `Np`, `cP`; konstanty `g_n`, `R`, `c`, `h`, `k_B`, `N_A`.

## Etapa 1: řady jako základ všeho dalšího

Dnes `exp` a `ln` na řadě fungují, ale `sqrt`, `abs`, `round`, `mod`, `norminv`, `tcdf` ne. Na tomhle stojí etapy 2, 3, 5 i 7.

| Rozšíření | Prověří |
|---|---|
| Všechny funkce jednoho čísla na řadě, včetně funkcí listu | `elektrotechnika-1` (harmonické, Feld 6.1), `datasety-10` |
| `round`, `ceil`, `floor` částek a veličin s jednotkou | `ekonomika-4` (daňové odpisy) |
| `sort`, `quantile`, pořadí se shodami, `prod`, `cumprod`, `diff`, `trapz` | `statistika-mereni-10` (Kruskal–Wallis, Spearman), `statistika-mereni-15` |
| `var`, `cov`, `corr`, statistiky proložení (s, chyby koeficientů) | `statistika-mereni-3` (regrese), `statistika-mereni-6` (radon, GUM H.4), `datasety-11` |
| `min`, `max`, `argmin` na matici; `F[1]` u proložení exp, power, log | `ekonomika-3` (15 kombinací, NIST 7-4), `chemie-3` |

## Etapa 2: `solve` jako výraz

Závisí na etapě 1, protože tabulka přes parametr potřebuje funkci na řadě. Otevře etapu 4 (parametr v rovnici).

| Rozšíření | Prověří |
|---|---|
| `solve` v těle funkce a ve sloupci tabulky | `chemie-5` (titrační křivka), `hydraulika-1`, `hydraulika-2`, `hydraulika-3` (Colebrook, návrh potrubí) |
| Nejmenší celé číslo splňující nerovnost | `ekonomika-8` (kdy vyměnit klimatizaci) |

## Etapa 3: opakování a stavba tabulek a matic

Závisí na etapě 1. Otevírá numerické metody a metodu konečných prvků.

| Rozšíření | Prověří |
|---|---|
| Sloupec čte předchozí řádek | `ekonomika-5` (splátkový kalendář), `datasety-4` (Euler, půlení, pevný bod) |
| Tabulka vytvořená z rozsahu | `ekonomika-1` (výběr projektů do rozpočtu, NIST 7-6) |
| `sum` přes matice, sestavení matice z indexů | `stavebni-statika-8` (příhradovina), `stavebni-statika-12` (stěna MKP 242 neznámých), pak `stavebni-statika-13` (podpory jen v tlaku) |

## Etapa 4: diferenciální rovnice

Navazuje na 0.3 až 0.5 a na etapu 2.

| Rozšíření (v tomhle pořadí) | Prověří |
|---|---|
| Řízená délka kroku, poznání singularity místo „dělení nulou“ | `elektrotechnika-8`, `datasety-3` |
| Podmínka na konci intervalu, integrace od ní | `hydraulika-7` (vzdutí nad jezem, Bellasis) |
| Soustavy rovnic | `chemie-7` (A ⇌ B), `elektrotechnika-9` (stavové rovnice) |
| Osamělá síla a vnitřní podpora | `stavebni-statika-3`, `stavebni-statika-7` (nosník na třech podporách) |
| Neznámý parametr v rovnici (kritická síla, vlastní frekvence) | proměnný průřez ze zprávy strojních částí, mezera `ode-parametric-solve` |

## Etapa 5: komplexní čísla až do konce

Navazuje na 0.6 a etapu 1. Pořadí je daná závislostí.

| Rozšíření | Prověří |
|---|---|
| `exp`, `sin`, `cos`, `cosh`, `tanh`, `ln` komplexního čísla | `elektrotechnika-10` (RLC, Laplace), `elektrotechnika-3` (dlouhé vedení) |
| Komplexní matice, `lsolve`, `det` | `elektrotechnika-2` (vázané cívky) |
| Vlastní čísla nesymetrické matice | `elektrotechnika-6` (stavová matice), `datasety-8` |
| Komplexní integrand a součet | `datasety-6` (Fourierova transformace) |
| Rozbalení fáze, Bode ve dvou grafech | `elektrotechnika-7` (stabilita zesilovače) |

## Etapa 6: lineární algebra a celá čísla

Nezávislá, lze ji předřadit.

| Rozšíření | Prověří |
|---|---|
| `rank`, `nullspace`, `gcd`, `lcm`, `rat` | `chemie-8` (vyčíslení rovnic), `chemie-9` (empirický vzorec), `hydraulika-8` (rozměrová analýza), `datasety-13` |
| `molar_mass("Ca3(PO4)2")` | `chemie-8` a každá stechiometrie |

## Etapa 7: speciální funkce, náhoda, grafy statistiky

Závisí na etapě 1.

| Rozšíření | Prověří |
|---|---|
| Nekonečné meze integrálu | `termodynamika-1` (Maxwell, Planck) |
| `gamma`, `lgamma`, `erf`, `besselj`, `hygepdf`, rozdělení s parametry | `stavebni-statika-6` (nejvyšší sloup), `datasety-15`, `statistika-mereni-14` |
| Minimalizace více parametrů | `statistika-mereni-1` (Misra1a, certifikovaná data NIST), `statistika-mereni-11` (Weibull) |
| Náhodná čísla, opakovatelná semínkem | `statistika-mereni-8` (Monte Carlo, NIST E3), `ekonomika-2` (NIST 8.6.6) |
| Histogram, krabicový graf, chybové úsečky | `statistika-mereni-15` |

## Co se vynechává a proč

- **Duplicity:** většina zadání v `zdroje/` odpovídá hotovým vzorům. Čisté příklady (`plain`) ve zprávách počkají, ať se limity neřeší kvůli nim. Sem patří i zbylých 27 hotových výpočtů z `vzory/`.
- **MathQA:** školní slovní úlohy, navíc často s chybným postupem. Hodí se jen na `gcd` a `lcm`, případně jako test, jak AI píše list ze zadání.
- **TheoremQA:** asi polovina úloh nejsou výpočty a odpovědi jsou často zaokrouhlené nebo špatné (#427, #459, #115). Bereme jen nápad úlohy a čísla ověřujeme sami.
- **Nečitelné:** dvě německé knihy z let 1903 a 1907 jsou sken bez textu. Bez rozpoznávání textu z nich nic nebude.
- **Zdroje bez výsledků:** KIT Hydromechanik (dobrá zadání, žádné výsledky, část tabulek poškozená) a MUNI termodynamika (ztracená znaménka mínus).

## Licence: čeká na rozhodnutí

Kalketa je MIT a vzory jsou její součástí.

- **Bez problému:** NIST, DOE (americká vláda), staré knihy (Lea, Bellasis, Leutwiler, Wood), CC BY (část LibreTexts).
- **Nesmí se použít ani přeformulovat:** OpenStax, podmínky zakazují použití v AI.
- **Riziko:** LibreTexts s CC BY-NC-SA (Roylance, Wierzbicki, Yan). NC vadí, kdyby se Kalketa někdy prodávala; bezpečné je použít vlastní čísla a vlastní text, nebo jiný zdroj.
- **Neuvedeno:** VŠB, VUT, ZČU, Feld (ČVUT). Dosud jsme z nich brali jen zadání a čísla, vlastními slovy.
- **CC BY-SA:** VŠE, Wikipedie. Odvozený text by mohl muset převzít stejnou licenci.

## Co se nečetlo celé

Dlouhé knihy se četly po obsahu a vzorcích, ne celé: Feld (1360 stran), Kuphaldt, Lea, Bellasis, Wood, Leutwiler, VŠB statistika, část GUM a NIST TN 1900 a HB 135, asi polovina TheoremQA. Pokud v nich něco leží, tenhle výběr to nezachytil. MathQA se prošla jen vzorkem a počty operací.
