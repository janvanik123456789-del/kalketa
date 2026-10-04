# Nápady a úkoly na později

Seznam věcí, které vznikly během práce a čekají na své místo. Nejnovější nahoře.

## Uživatelské rozhraní

### ~~Postranní panel jako záložky~~ (2026-10-04, hotovo týž den)

*Hotovo:* nahoře v bočním panelu jsou záložky Podrobnosti, Tabulky, Vrstvy, AI a ✕ pro skrytí. Původní zápis:

Boční panel (Podrobnosti, Tabulky, Vrstvy, Rozhovor s AI) přepínat záložkami nahoře v panelu, ne jen přes Zobrazení → Boční panel a ikony lišty. Rychlejší přepnutí a hned je vidět, co v panelu je. Kandidát po etapě 3 AI.

## Okno rozhovoru s AI

### ~~Vzorec z výřezu do zápisu Kalkety~~ (2026-10-04, hotovo týž den)

*Hotovo:* tlačítko „Vzorce z výřezů (AI)“ v Podkladech, blok `kalk` pod obrázkem (kap. 9.6). Lokální model uživatele obrázky čte. Původní zápis:

Výřez z PDF vloží vzorec jako obrázek. Člověk ho přečte, model ani výpočet ne. Model, který umí číst obrázky (Claude, lokální „vision“ modely), by z výřezu přepsal vzorec do zápisu Kalkety (např. `w := 5·q·L⁴/(384·E·I)`), člověk by ho potvrdil a vzorec by šel do Podkladů jako text i do výpočtu. Lokální model uživatele to nejspíš neumí.

### Nastavení lokálního modelu: přemýšlení a vzorkování (2026-10-04, na doladění)

Lokální model (`qwen3.8-flash…iq3_xxs` přes llama.cpp) se v přemýšlení zacyklí na „možná“ a odpověď trvá 3–5 minut. Hloubka přemýšlení se posílá jako `reasoning_effort`, ale llama.cpp ji nejspíš ignoruje. Hrubá kvantizace (asi 3 bity) k opakování přispívá.

1. **Přemýšlení zapnuto/vypnuto** v Nastavení AI pro lokální server, nejspíš přes `chat_template_kwargs: {enable_thinking: false}`. Ověřit na serveru uživatele (127.0.0.1:8080), které parametry opravdu bere.
2. **Parametry vzorkování** pod „Pokročilé“: teplota, top_p, top_k, penalizace opakování (`presence_penalty`). Výchozí hodnoty podle výrobce modelu, pro Qwen v přemýšlivém režimu 0.6 / 0.95 / 20, proti opakování `presence_penalty` 1.0–1.5.
3. (Volitelně) **pojistka proti smyčce:** když se přemýšlení opakuje, zastavit ho a nabídnout zkusit znovu bez přemýšlení.

### ~~Upravený výpočet do nového listu~~ (2026-10-04, hotovo týž den)

*Hotovo:* pod odpovědí s návrhy je „Přijmout vše (n)“ se společným dopadem na výpočet (jedno Zpět) a „Do nového listu“, které zkopíruje výpočet do nové záložky (bez revizí, neuložené) a změny použije tam. Deník původního listu zapíše „Přijato do nového listu“, model to ví. Původní zápis:

Uživatel chtěl po AI „na novém listu udělej ten samý výpočet, jen se silou uprostřed místo spojitého zatížení“. Model umí měnit jen otevřený list, a tak navrhl přepsat ten. Podle uživatele má AI umět **výpočet zduplikovat do nového listu a už upravený**.

- **Přijmout do nového listu:** na kartě návrhu, případně u celé odpovědi. Program zkopíruje list (tabulky, vrstvy, odkazy na knihovny) do nové záložky a změny použije tam. Původní list zůstane beze změny.
- **Přijmout všechny návrhy odpovědi:** návrhy jedné odpovědi často patří k sobě. Změna řádku 6 `q → F` bez změny řádků 11–13 rozbije výpočet. Proto přijmout najednou se společným dopadem na výpočet, změny použít odspodu, aby se čísla řádků neposunula.
- **Pokyn pro model:** když uživatel chce nový nebo upravený list, má model navrhnout bloky změn s tím, že je program použije v kopii. Nemá tvrdit, že nový list vytvořit nejde.
- **Deník:** zapsat, do kterého listu se změny použily (kopie vzniklá z listu X).

### Složka studijních podkladů PDF a HTML (2026-10-04, etapy A a B hotové týž den)

*Hotovo:* čtení PDF, HTML a MD ze složek teorie, citace po stránkách, dialog Nástroje → Studijní podklady s výběrem kapitol a stránek a upozorněním na velkou knihu (kap. 9.6). *Etapa C hotová týž den:* návrh kapitol podle výpočtu a převod výběru přes vrstvu Podklady na `.kalkt`. Původní zápis:

Návrh uživatele: Kalketa by měla mít vlastní složku pro studijní podklady v PDF nebo HTML (normy, skripta, články), ze které model čerpá jako z teorie. Cesty k souborům v Podkladech nejsou dobré řešení: nepřenesou se s výpočtem a model je sám neotevře.

Jak by to šlo na dnešní základ (kap. 9.6):

- **Kde:** dnešní složky teorie (uživatelská `Dokumenty\Kalketa\Teorie`, firemní `theoryFolder`, složka projektu) by vedle `.kalkt` přijímaly i `.pdf`, `.html` a `.md`. Firemní složka se tak dá naplnit normami pro všechny.
- **Převod na text:** PDF přes pdf.js (licence Apache-2.0), po stránkách. Použije se dnešní čištění textu z PDF: slepená slova, zbytky, vzorce. HTML se převede na čistý text podle nadpisů. Skeny bez textové vrstvy by potřebovaly OCR, zatím ne.
- **Rejstřík:** úseky podle nadpisů, nebo podle stránek, kde nadpisy chybí. Ty se indexují stejným BM25 jako knihovny. Rejstřík se uloží vedle souboru nebo do mezipaměti uživatele a obnoví se jen při změně souboru (podle otisku).
- **Citace:** klíč souboru a stránka, např. `[EN1993:s45]`. Ověření citace je text na té stránce. Ve vrstvě AI to bude skupina „Studijní podklady“ s názvem souboru a stránkou.
- **Do výpočtu:** stejně jako u knihoven se do souboru `.kalk` uloží kopie citovaných úseků a odkaz na soubor, aby výpočet šel předat bez celé složky.
- **Vztah ke `.kalkt`:** složka je rychlý start bez přípravy, `.kalkt` je pečlivě připravená knihovna (vyčištěný text, obrázky, stálé id). Z PDF ve složce by šla jedním příkazem vyrobit `.kalkt`.
- **Rozsah podkladů (poznámka uživatele 2026-10-04, k rozvedení):** člověk by neměl do podkladů dávat celou knihu o strojařině, jen vybrané statě. Možnosti: (a) návod a upozornění přímo v programu, (b) automatizace, kdy program navrhne výběr kapitol podle výpočtu, (c) celá kniha ve složce, ale s instrukcí číst jen vybrané stránky nebo kapitoly (rozsah stránek u souboru). Zatím otevřené, rozvedeme.
- **Pozor:** autorská práva norem. Text zůstává u uživatele a jde jen do jeho modelu; do `.kalk` jen citované úseky.

### Web jako zdroj (2026-10-04)

Lokální model web neumí, Kalketa mu ho může dát:

1. **Hledání dělá program** (jako u teorie, kap. 9.6): podle otázky vyhledá, stáhne pár výsledků a přiloží je modelu jako zdroje. Funguje s každým modelem.
2. **Nástroj pro model** `search_web`: model si o hledání řekne sám. Potřebuje model, který umí volat nástroje (ověřit na serveru uživatele).
3. **Claude:** vestavěné hledání na straně Anthropicu, placené za hledání.

Potřeba vyhledávač: placené API (Brave, Bing) nebo vlastní SearXNG. Dotazy odcházejí ven: firemní pravidla musí web umět zakázat. Citace z webu ve vrstvě AI jako skupina „Web“ s adresou; ověření citace = text na stažené stránce.

### ~~Rozbalovací řádek „přemýšlení“~~ (2026-10-04, hotovo týž den)

*Hotovo:* během přemýšlení je v chatu sbalený řádek „přemýšlí… N s“; po rozbalení ukazuje průběžné přemýšlení modelu (lokální `reasoning_content`, u Clauda souhrn, pokud ho posílá). Na obrazovce zůstává konec, posledních 6000 znaků, a nikam se neukládá. Původní zápis:

Lokální model s přemýšlením může před odpovědí přemýšlet i několik minut. Uživatel zatím vidí jen „přemýšlí… 240 s“.

- Při čekání ukazovat **sbalený řádek s průběžným přemýšlením modelu**, který si uživatel může rozbalit. Zabaví ho to a uvidí, že model pracuje a o čem uvažuje.
- Zdroj: lokální servery posílají přemýšlení v proudu jako `reasoning_content` (dnes ho Kalketa jen počítá jako znamení „přemýšlí“). Claude ho vrací jako souhrn při `thinking.display: "summarized"`.
- Přemýšlení se neukládá do souboru (jen odpověď), nebo jen na přání.

### ~~Prázdná odpověď po dlouhém přemýšlení~~ (2026-10-04, hotovo týž den)

*Hotovo:* konec kvůli limitu se pozná, uživatel dostane vysvětlení místo prázdné bubliny, prázdná odpověď se neukládá, useknutá odpověď má poznámku, limit lokálních serverů je 16 384 tokenů. Původní zápis:

Na „Analyzuj výpočet.“ model přemýšlel asi 4 minuty a pak nedal žádný text. Pravděpodobně vyčerpal celý limit `max_tokens` (8192) přemýšlením (u lokálních modelů se do limitu počítá i přemýšlení). Kalketa uložila prázdnou bublinu.

- Rozpoznat konec kvůli limitu (`finish_reason: "length"` u lokálních serverů, `stop_reason: "max_tokens"` u Clauda) a místo prázdné bubliny napsat, co se stalo: model nestihl odpovědět, zkuste nižší hloubku přemýšlení nebo užší otázku.
- Prázdnou odpověď do rozhovoru neukládat.
- Zvážit vyšší limit pro lokální servery (kontext tvého serveru je 64k) nebo ho odvodit z velikosti kontextu.
