/**
 * The help of each built-in function in Czech (Help → Functions, F1): what its arguments are, what unit the
 * result has and what to watch for. The one sentence of the function is in cs.ts (functions); the example
 * in the notation of the sheet is in the editor (functionHelp.ts), the same for every language.
 */
/** The lines that are no functions: solve, derive, relation. */
export const CS_STATEMENT_HELP: Readonly<Record<string, { readonly summary: string; readonly details: string }>> = {
  solve: {
    summary: 'Řešení rovnice nebo soustavy rovnic: solve x: k·x == F najde x, při kterém se obě strany rovnají. Neznámá je pak hodnota listu.',
    details:
      'Rovnice se píše s ==. Víc neznámých a rovnic se odděluje čárkou: solve (x, y): x + y == 1, x - y == 0. in a .. b omezí hledání na interval, guess x = 1 m dá první odhad (a s ním jednotku). S oborem ∈ ℝ, ℂ, ℕ, ℕ₀ nebo ℤ (tlačítko ℝ▾) a podmínkami za čárkou (solve x ∈ ℝ, x > 0: …) vypíše všechny kořeny jako na papíře, kvadratickou rovnici s diskriminantem, a ty, které nevyhoví, označí; dva kořeny jsou pak x_1 a x_2. solve w(x): … řeší diferenciální rovnici, solve y: Kruh rovnici pojmenované relace. Zapisuje se tlačítkem solve na panelu Funkce.',
  },
  derive: {
    summary: 'Odvození vzorce krok po kroku: derive a == b == c ověří, že každý krok plyne z předchozího, jako by to kontroloval učitel.',
    details:
      'Kroky se oddělují ==; program je porovná pro obecné hodnoty, správný krok označí jako ověřený, chybný jako chybu. ≐ označí krok, který platí jen přibližně (malé úhly: sin(γ) ≐ γ). derive M := … == … pojmenuje výsledný vzorec, takže ho lze dál použít. Kroky mohou vycházet z relací nad řádkem. Zapisuje se tlačítkem a=b na panelu Funkce.',
  },
  relation: {
    summary: 'Rovnice, která platí: fyzikální zákon nebo geometrický vztah, např. relation x^2 + y^2 == r^2 {eq=Kruh}.',
    details:
      'Na rozdíl od solve nic nepočítá ani nekontroluje; jména, která list nemá, jsou v ní obecné symboly. Vycházejí z ní kroky derive pod ní. Pojmenovaná ({eq=Kruh}) se řeší řádkem solve y: Kruh a do grafu se kreslí jako křivka: plot(Kruh, x: -6 m .. 6 m, y: -6 m .. 6 m).',
  },
  check: {
    summary: 'Posudek: podmínka, kterou výpočet musí splnit, např. check "Ohyb": σ ≤ f_y. V tisku s využitím a slovem VYHOVUJE / NEVYHOVUJE.',
    details:
      'Podmínka je porovnání (≤, <, ≥, >, ==), lze je spojit and / or; popis v uvozovkách je volitelný. Využití je podíl stran (σ / f_y). Za podmínkou může stát zdroj: source "EN 1993-1-1, 6.2.5". Souhrn posudků je na začátku tisku a ve stavovém řádku; podobu výsledku (VYHOVUJE, VYHOVÍ, jen ✓) určí Vlastnosti výpočtu.',
  },
  source: {
    summary: 'Zdroj vzorce nebo posudku na konci řádku: M_Ed := 1.35·G_k source "EN 1990, 6.10".',
    details: 'V tisku stojí za vzorcem v hranatých závorkách, ve stylu se sloupci v levém sloupci; kontrolor tak vidí, odkud vzorec nebo mez je. Patří k definicím i posudkům.',
  },
  table: {
    summary: 'Tabulka přímo v listu: řádek table Mereni: a pod ním odsazené řádky | … |; první je záhlaví.',
    details:
      'Záhlaví: jméno sloupce, jednotka v [ ], formát čísel v { } ({0.0}). Ve výpočtu je Mereni.T řada v jednotce sloupce a Mereni.t[2] jedna hodnota; fungují pick, find_min, interpolate. Vzorec v záhlaví za = počítá sloupec (g_k [kN/m²] = h·ρ), Σ v buňce sečte sloupec. Klik na tabulku ji otevře jako mřížku, {across} ji vytiskne na šířku. Katalogové tabulky (profily, materiály) patří do vrstvy Data.',
  },
  unit: {
    summary: 'Vlastní jednotka: unit EUR := 25 CZK (kurz, alias), unit ks: dimensionless (kusy), unit CZK: Mena (základ nové dimenze).',
    details:
      'S := je jednotka daná hodnotou jiných jednotek a dál se s ní počítá jako s vestavěnými (4 ks · 120 EUR | CZK). S : je to základní jednotka dimenze z řádku dimension, nebo dimensionless pro počitatelné věci. Vestavěné měny (CZK, EUR, USD …) mají každá svou dimenzi, dokud list neurčí kurz.',
  },
  dimension: {
    summary: 'Nová základní dimenze (měna, body, kusy): dimension Body; její jednotky určí řádky unit pod ní.',
    details:
      'Veličiny různých dimenzí nejde sčítat ani porovnávat, takže list hlídá, aby se třeba body nesčítaly s korunami. Za dimension následuje unit se základní jednotkou (unit bod: Body) a případně další jednotky z ní (unit cent := bod/100).',
  },
  input: {
    summary: 'Vstup bloku: input q := 12 kN/m je hodnota, kterou volání bloku může změnit; v listu samotném platí jako obyčejná definice.',
    details:
      'Blok (Vložit → Blok ze souboru…) je hotový výpočet uložený v listu; volá se jménem a vstupy jménem: N1 := Prosty_nosnik(L: 6 m, q: 10 kN/m), nezadané vstupy platí z bloku. Vstup musí mít stejný rozměr jako v bloku. Výsledky bloku se čtou tečkou: N1.M_max.',
  },
};

export const CS_FUNCTION_DETAILS: Readonly<Record<string, string>> = {
  // Matematika
  abs: 'Argument může mít jednotku, výsledek ji zachová (|−3,5 kN| = 3,5 kN). U komplexního čísla vrátí velikost |a + bj| = √(a² + b²). Velikost řady (vektoru) dá norm.',
  cbrt: 'Na rozdíl od x^(1/3) dá i ze záporného čísla reálný výsledek. Jednotka se odmocní, jde-li to (∛(m³) = m). Stejné jako znak ∛ z panelu operátorů.',
  ceil: 'Zaokrouhlí na nejbližší vyšší celé číslo, i u záporných (ceil(−2,3) = −2). Argument musí být bezrozměrný; počet kusů zaokrouhlený nahoru se počítá z poměru, např. ceil(L / l_kus).',
  exp: 'eˣ pro bezrozměrné x; e^x se dá napsat i jako mocnina čísla e. U komplexního x dá komplexní výsledek (Eulerův vzorec).',
  factorial: 'n! = 1·2·…·n pro celé n od 0 do 170 (0! = 1); větší n přeteče rozsah čísel. Necelé nebo záporné n je chyba.',
  floor: 'Zaokrouhlí na nejbližší nižší celé číslo, i u záporných (floor(−2,3) = −3). Argument musí být bezrozměrný.',
  hypot: '√(a² + b² + …) pro libovolný počet hodnot téže jednotky, bez přetečení u velkých čísel. Typicky přepona nebo velikost výslednice ze složek.',
  ln: 'Přirozený logaritmus bezrozměrného kladného čísla. Logaritmus veličiny s jednotkou nedává smysl: logaritmujte poměr, např. ln(p_1 / p_2).',
  log: 'Logaritmus x o základu b; log(x, 10) je log10(x). Obě čísla musí být bezrozměrná a kladná, základ různý od 1.',
  log10: 'Dekadický logaritmus bezrozměrného kladného čísla, např. pro decibely 10·log10(P / P_0).',
  max: 'Bere jednotlivé hodnoty i řady (také sloupec tabulky). Všechny musí mít stejnou jednotku; výsledek je v jednotce první hodnoty.',
  min: 'Bere jednotlivé hodnoty i řady (také sloupec tabulky). Všechny musí mít stejnou jednotku; výsledek je v jednotce první hodnoty.',
  mod: 'Zbytek po dělení a/b; výsledek má znaménko b (mod(−7, 3) = 2). a a b mohou mít stejnou jednotku, např. mod(370°, 360°) = 10°.',
  root: 'n-tá odmocnina pro celé n ≥ 2. Lichá odmocnina záporného čísla je záporná, sudá je chyba. Jednotka se odmocní, jde-li to. Stejné jako tlačítko ⁿ√.',
  round: 'Bez druhého argumentu na celé číslo, s ním na n desetinných míst. Zaokrouhluje hodnotu ve výpočtu; jen pro zobrazení stačí {decimals=2} za řádkem.',
  sign: 'Znaménko čísla jako −1, 0 nebo 1, bez jednotky. Hodí se např. pro směr síly: F·sign(v).',
  sqrt: 'Druhá odmocnina; jednotka se odmocní (√(m²) = m, √(m) zůstane jako m^0,5). Ze záporného čísla vyjde komplexní číslo. Stejné jako znak √.',
  // Goniometrické
  acos: 'Arkus kosinus čísla z intervalu −1 až 1; výsledek je úhel v rad od 0 do π. Ve stupních ho ukáže | ° za řádkem.',
  acosh: 'Inverzní hyperbolický kosinus pro x ≥ 1; výsledek bezrozměrný.',
  asin: 'Arkus sinus čísla z intervalu −1 až 1; výsledek je úhel v rad od −π/2 do π/2. Ve stupních ho ukáže | ° za řádkem.',
  asinh: 'Inverzní hyperbolický sinus; výsledek bezrozměrný.',
  atan: 'Arkus tangens; výsledek je úhel v rad od −π/2 do π/2. Pro úhel bodu ve všech kvadrantech použijte atan2(y, x).',
  atan2: 'Úhel bodu (x, y) od kladné osy x, od −π do π, tedy se správným kvadrantem. Pozor na pořadí: nejdřív y, potom x. Obě souřadnice mohou mít stejnou jednotku.',
  atanh: 'Inverzní hyperbolický tangens pro −1 < x < 1; výsledek bezrozměrný.',
  cos: 'Úhel bez jednotky se bere v radiánech; ve stupních napište 60° (nebo 60 deg). Výsledek je bezrozměrný.',
  cosh: 'Hyperbolický kosinus bezrozměrného čísla, např. řetězovka y = a·cosh(x / a).',
  cot: 'Kotangens = 1/tan; v násobcích π (0°, 180° …) není definován. Úhel v rad nebo se znakem °.',
  cotg: 'Totéž co cot, pod jménem, které používají české učebnice.',
  sin: 'Úhel bez jednotky se bere v radiánech; ve stupních napište 30° (nebo 30 deg). Výsledek je bezrozměrný.',
  sinh: 'Hyperbolický sinus bezrozměrného čísla.',
  tan: 'Úhel bez jednotky se bere v radiánech; ve stupních napište 45°. V lichých násobcích 90° není definován.',
  tanh: 'Hyperbolický tangens bezrozměrného čísla, výsledek mezi −1 a 1.',
  tg: 'Totéž co tan, pod jménem, které používají české učebnice.',
  // Integrály a derivace
  derivative: 'Numerická derivace výrazu nebo funkce listu podle pojmenované proměnné v bodě a; order: 2 dá druhou derivaci. Jednotka výsledku je jednotka f lomeno jednotkou x (u druhé derivace x²). Pro odvození vzorce derivace řádkem derive použijte tlačítko d/dx.',
  fit: 'Proloží body (y proti x) křivkou metodou nejmenších čtverců. kind: "linear", "poly2" až "poly10", "exp", "power", "log". Výsledek je funkce listu, kterou lze volat (T_fit(15 s)) i kreslit; tisk ukáže její rovnici s čísly a R². steps: true vypíše postup výpočtu. Vlastní tvar místo druhu, jako linfit v Mathcadu: form: [1, t, sin(ω·t)] najde koeficienty kombinace c₀ + c₁·t + c₂·sin(ω·t); funkce se píšou ve jménu sloupce x (t) a každý koeficient dostane svou jednotku. Pohodlněji: Vložit → Proložit křivku…',
  integral: 'Určitý integrál výrazu podle pojmenované proměnné v mezích a .. b. Meze mohou mít jednotky; výsledek má jednotku f krát jednotku x (např. kN/m · m = kN). Počítá se numericky s přesností na zhruba 10 platných číslic.',
  maximize: 'Vrátí hodnotu x, v níž je f v intervalu a .. b největší (ne hodnotu f). Maximum samo je pak f(x_max). Hledá globální maximum v intervalu, i na jeho okraji.',
  minimize: 'Vrátí hodnotu x, v níž je f v intervalu a .. b nejmenší (ne hodnotu f). Minimum samo je pak f(x_min). Hledá globální minimum v intervalu, i na jeho okraji.',
  polyfit: 'Koeficienty polynomu stupně n proloženého body x, y metodou nejmenších čtverců, jako v MATLABu a NumPy. Výsledek je funkce P(x) s jednotkami a tisk ukáže její rovnici. Bodů musí být aspoň n + 1.',
  polyval: 'Hodnota polynomu v bodě nebo v řadě bodů. P může být funkce z polyfit, nebo řada koeficientů od nejvyšší mocniny jako v MATLABu: [1, 0, −2] je x² − 2.',
  roots: 'Všechny kořeny mnohočlenu ve výrazu p v proměnné x, i komplexní, jako řada. Pro jiné rovnice než mnohočleny použijte řádek solve x: … (s oborem ∈ ℝ a podmínkami).',
  // Matice a vektory
  col: 'Sloupec j matice A (číslováno od 1) jako řada.',
  cols: 'Počet sloupců matice; u řady 1.',
  cross: 'Vektorový součin a × b dvou řad o třech prvcích; jednotky se násobí (r × F dá moment v N·m).',
  det: 'Determinant čtvercové matice; jednotka je jednotka prvků na n-tou. Nulový determinant znamená, že soustava nemá jednoznačné řešení.',
  diag: 'Z řady udělá čtvercovou matici s řadou na diagonále (jinde nuly); z matice vrátí její diagonálu jako řadu.',
  dot: 'Skalární součin a·b = a₁b₁ + a₂b₂ + … dvou řad stejné délky; jednotky se násobí (F·s dá práci v J).',
  eigenvals: 'Vlastní čísla symetrické matice K vzestupně. S druhou maticí M řeší zobecněnou úlohu K·φ = λ·M·φ, např. tuhost a hmotnost při kmitání (λ = ω², vlastní frekvence f = √λ / (2·π)).',
  eigenvecs: 'Vlastní vektory k eigenvals ve stejném pořadí, jako sloupce matice; každý je normovaný tak, že jeho největší prvek je 1.',
  identity: 'Jednotková matice n×n (jedničky na diagonále).',
  inverse: 'Inverzní matice čtvercové regulární matice; jednotky se převrátí. Totéž zapíšete jako A^-1. Pro řešení soustavy je přesnější lsolve(A, b).',
  lsolve: 'Řešení soustavy lineárních rovnic A·x = b LU rozkladem. Jednotky x vyjdou z jednotek A a b (tuhost kN/m a síly kN dají posuny v m). b může být i matice s více pravými stranami.',
  norm: 'Velikost řady √(v₁² + v₂² + …) v její jednotce, např. délka vektoru nebo výslednice.',
  row: 'Řádek i matice A (číslováno od 1) jako řada.',
  rows: 'Počet řádků matice; u řady počet jejích prvků.',
  trace: 'Součet prvků na diagonále čtvercové matice.',
  transpose: 'Zamění řádky za sloupce; z řady (sloupce) udělá řádek.',
  // Komplexní čísla
  arg: 'Úhel komplexního čísla od −π do π v rad; | ° ho ukáže ve stupních. U fázoru napětí je to fázový posun.',
  conj: 'Komplexně sdružené číslo a − bj; jednotka zůstane. Hodí se pro zdánlivý výkon S = U·conj(I).',
  im: 'Imaginární část komplexního čísla, s jeho jednotkou.',
  polar: 'Komplexní číslo z velikosti r (s jednotkou) a úhlu φ: r·(cos φ + j·sin φ). Úhel ve stupních se znakem °.',
  re: 'Reálná část komplexního čísla, s jeho jednotkou.',
  // Řady
  cumsum: 'Řada průběžných součtů: [1, 2, 3] dá [1, 3, 6]. Jednotka zůstane, např. narůstající zatížení.',
  interp1: 'Hodnota v bodě xi podle bodů x, y. Metoda: "linear" (lomená čára, výchozí), "nearest", "spline", "pchip"; s "extrap" pokračuje za krajní body, jinak je to tam chyba. x musí být rostoucí; xi může být číslo i řada.',
  len: 'Počet prvků řady nebo sloupce tabulky.',
  pchip: 'Po částech kubická interpolace, která nepřekmitne: mezi rostoucími body zůstane rostoucí. Vhodná pro měřená data. Za krajními body pokračuje.',
  range: 'Řada od from do to včetně s krokem step (bez kroku po 1). Krok může mít jednotku: range(0 m, 6 m, 0,5 m). Nejvýš 10 000 prvků.',
  spline: 'Hladký kubický spline bodů x, y (konce not-a-knot jako v MATLABu). Mezi body může překmitnout; pro měřená data bývá vhodnější pchip.',
  sum: 'Součet prvků řady nebo sloupce tabulky (sum([1, 2, 3] kN) = 6 kN). Se dvěma argumenty sečte výraz přes celé k: sum(1/k², k: 1 .. 100). Jednotky musí souhlasit.',
  // Statistika
  mean: 'Aritmetický průměr řady nebo sloupce tabulky, v jejich jednotce.',
  median: 'Prostřední hodnota seřazené řady; u sudého počtu průměr dvou prostředních. Méně citlivá na odlehlé hodnoty než průměr.',
  stdev: 'Výběrová směrodatná odchylka √(Σ(x − x̄)² / (n − 1)), v jednotce dat. Potřebuje aspoň dvě hodnoty.',
  normcdf: 'Pravděpodobnost, že normovaná normální veličina nepřekročí x; x je bezrozměrné (hodnotu převeďte: (x − μ)/σ).',
  norminv: 'Hodnota, kterou normovaná normální veličina nepřekročí s pravděpodobností p (0 < p < 1); 95 % oboustranně: norminv(0,975) = 1,960. Pro N(μ, σ): μ + σ·norminv(p).',
  tcdf: 'Pravděpodobnost, že veličina se Studentovým rozdělením s ν stupni volnosti nepřekročí t; ν nemusí být celé (Welchův–Satterthwaiteův vzorec).',
  tinv: 'Kvantil Studentova rozdělení (0 < p < 1, ν > 0), jako tinv v MATLABu a T.INV v Excelu. Koeficient rozšíření pro 95 % z n měření: k = tinv(0,975; n − 1), pro n = 22 je k = 2,080 (GUM, NIST TN 1900).',
  // Finance
  irr: 'Úroková míra, při níž je čistá současná hodnota toků CF nulová. První tok bývá záporný (investice), další kladné. Výsledek je podíl (0,089); v procentech ho ukáže | % za řádkem.',
  npv: 'Součet toků CF diskontovaných sazbou rate: první tok je dnes, k-tý se dělí (1 + rate)^(k − 1). Sazba za období, např. 5 %.',
  payback: 'Kolik období trvá, než součet toků CF dosáhne nuly; mezi obdobími lineárně. Když se investice nevrátí, je to chyba.',
  pmt: 'Pravidelná splátka anuitního úvěru: sazba za období, počet období a jistina. Při měsíčních splátkách dělte roční sazbu 12. Výsledek v jednotce jistiny.',
  // Data
  date: 'Datum z roku, měsíce a dne. Datum jde napsat i přímo: 2026-10-21. K datu lze přičíst dny (+ 30 d).',
  day: 'Den v měsíci (1–31) jako číslo.',
  month: 'Měsíc (1–12) jako číslo.',
  year: 'Rok jako číslo.',
  // Logika
  if: 'Podmíněná hodnota: je-li podmínka splněna, výsledek je then, jinak else. Podmínka je porovnání (<, ≤, ==, ≠ …), lze je spojit and / or. Obě větve mají mít stejnou jednotku. Porovnává-li podmínka řadu (x > 0 m pro řadu x), platí po prvcích: výsledek je řada a každý prvek se vezme z then nebo z else (z řady stejné délky její prvek, z čísla to číslo), např. kladná část řady if(x > 0 m, x, 0 m).',
  // Tabulky
  compare:
    'Porovná varianty výpočtu. Tabulka variant (table Varianty: {variants=B}) má v prvním sloupci jména variant a v dalších sloupcích vstupy listu (b [mm], h [mm]); list počítá se zvolenou variantou (=B, bez ní s první). compare(Varianty, W, σ) spočítá list pro každou variantu a vrátí tabulku zadaných hodnot, s největším využitím η_max a výsledkem posudků ✓; zvolená varianta je v tisku zvýrazněná.',
  filter: 'Vrátí tabulku jen s řádky, které splňují podmínku; ve where je r zkoušený řádek a r.sloupec jeho hodnota. Výsledek lze dál použít v max, sum nebo find_min.',
  find_max: 'Najde řádek s největší hodnotou sloupce by mezi řádky, které splňují where (r je zkoušený řádek). Hodnota jiného sloupce řádku se čte tečkou: find_max(…).A.',
  find_min: 'Najde řádek s nejmenší hodnotou sloupce by mezi řádky, které splňují where (r je zkoušený řádek). Typicky nejlehčí profil, který vyhoví: find_min(Profily, by: A, where: r.W_y ≥ W_pot).',
  interpolate: 'Lineární interpolace v tabulce podle hodnoty sloupce (T: 25 °C); vrátí řádek, z něhož se hodnota čte tečkou. Se dvěma pojmenovanými sloupci interpoluje ve dvou proměnných. Mimo rozsah tabulky je to chyba.',
  pick: 'Řádek tabulky podle hodnoty klíčového sloupce (prvního); hodnota se z něj čte tečkou: pick(Profily, "IPE 200").W_y. Lze vybrat i podle jiného sloupce: pick(Kurzy, datum: 2026-09-30). V listu u řádku se objeví seznam pro výběr.',
  // Grafy
  plot: 'Graf funkce v rozsahu x: a .. b, více funkcí oddělených čárkou do jednoho grafu, nebo dat proti řadě (x: Mereni.t). Volby: kind ("line", "points", "bar", "surface"), title, samples, roots, area, tangent a další; | jednotka za řádkem určí jednotku osy y. Pohodlněji: Vložit → Graf…',
};
