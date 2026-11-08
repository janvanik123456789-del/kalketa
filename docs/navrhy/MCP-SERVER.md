# Kalketa jako MCP server (návrh, 2026-11-08)

Stav (2026-11-08): **fáze 1 a 2 jsou v programu.** Otázky na konci jsou rozhodnuté podle doporučení: vypnuto ve výchozím stavu, jen návrhy s kartou, jen aktivní list, Claude Code první. Server je v `packages/desktop/src/mcp.ts`, nástroje v `packages/editor/src/logic/mcpTools.ts`, okno v `McpDialog.tsx`. Návrh z MCP se zapíše do deníku jako rozhovor `mcp-<klient>` a nad listem se objeví lišta „… navrhuje změny listu · Ukázat“. Ověřeno smoke testem se skutečným klientem MCP a s Claude Code u uživatele (fáze 1). Zbývá fáze 3 (Python, PDF, rozšíření `.mcpb` pro Claude Desktop) a návod do wiki.

Podnět: uživatel nechce kupovat API, aby AI v Kalketě vyzkoušel. Konkurenti, kteří AI mají, ji připojují opačně než Kalketa: nevolají model, ale **nechají AI aplikaci ovládat program přes MCP** (Model Context Protocol). Platí se pak z předplatného, které člověk má (Claude, ChatGPT), nebo z místního modelu.

- **Open CalcSheet Studio:** vestavěný MCP server a stejné REST API, 43 nástrojů. Jen `127.0.0.1:3879`, token, režim „jen číst“, „pozastavit“, stav ve stavovém řádku. Zdroj: `KONKURENCE/Open-CalcSheet-Studio-main/docs/mcp.md`.
- **CivilKit Calcs:** veřejný MCP server na webu, jen čtení, bez stavu, 11 nástrojů nad stejným výpočetním jádrem jako aplikace (`civilkit-calcs-main/docs/mcp.md`).
- **jamCalc:** API dokumentu (změny dávkou, vše nebo nic, chyba ukazuje na číslo operace) a nad ním příkazová řádka (`jamCalc-main/docs/decisions/0009-document-api.md`).
- **Maple:** placený Maple MCP s kredity v údržbě licence.

Proč ne „přihlásit se Claudem“ přímo v Kalketě: Anthropic v únoru 2026 zakázal používat přihlášení z předplatného Claude v cizích aplikacích a od dubna to vymáhá. Opačný směr je v pořádku: oficiální Claude Desktop nebo Claude Code se připojí k místnímu MCP serveru a běží na předplatném uživatele.

## Hlavní doporučení

**Vestavěný MCP server v desktopové Kalketě, vypnutý, dokud ho uživatel nezapne. AI přes něj čte otevřený list a navrhuje změny. Ty se v Kalketě objeví jako karty Přijmout / Odmítnout, stejně jako z chatu.** AI nikdy nemění výpočet sama (kap. 9 filozofie). Kalketa přidá to, co klient AI nemá: kontrolu navrženého listu, kontrolu v Pythonu, katalog vzorců a vzorů a pravidla zápisu.

Oproti CalcSheet Studiu:

- **Vypnuto ve výchozím stavu.** Kalketa je bez AI, dokud ji člověk nezapne. CalcSheet má server zapnutý hned.
- **Bez přímého zápisu.** U CalcSheet AI zapisuje rovnou (`sheet_set_source`), u Kalkety jen navrhuje.
- **Navržená změna se hned zkontroluje** a AI dostane chyby v odpovědi nástroje. Opraví se dřív, než to člověk uvidí. V chatu to dnes dělá kontrola navrženého listu.

## Jak se klienti připojí

| Klient | Cesta | Poznámka |
|---|---|---|
| **Claude Code** | `claude mcp add --transport http kalketa http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"` | Umí HTTP přímo. |
| **Claude Desktop** | Rozšíření `.mcpb` (Nastavení → Rozšíření, jedním klikem) s malým mostem stdio ↔ HTTP | Soubor `claude_desktop_config.json` bere jen místní programy přes stdio, položku `url` nepodporuje (hlášená chyba). Most spouští Node, které Claude Desktop pro rozšíření má. |
| **Gemini CLI, Cursor, VS Code, Kilo, Cline** | `mcpServers` s `url` (HTTP), nebo most přes stdio | Gemini CLI zdarma pro osobní účty už nejspíš končí (hlášeno k 18. 6. 2026). |
| **ChatGPT (Plus, vývojářský režim)** | Jen vzdálený HTTPS server, na místní Kalketu potřebuje tunel | Zatím ne. |

V Kalketě: **Nástroje → AI zvenku (MCP)…**. Okno má přepínač Zapnout, adresu, token (zobrazit, kopírovat, nový), Jen číst, Pozastavit a hotové řádky pro Claude Code, JSON a tlačítko **Uložit rozšíření pro Claude Desktop (.mcpb)**. Ve stavovém řádku je drobný stav: `MCP: čeká`, `připojeno (Claude)`, `jen číst`, `pozastaveno`, `port obsazen`.

## Nástroje

Názvy a popisy anglicky (klient si je přeloží), jak to má CalcSheet. Pracuje se s **aktivní záložkou**. Ostatní otevřené listy vidí AI jen podle názvu, obsah jen se svolením (jako „Ostatní otevřené listy“ v chatu dnes).

### Čtení (fáze 1)

| Nástroj | Co vrátí | Z čeho v Kalketě |
|---|---|---|
| `sheet_get` | Očíslované řádky, výsledky, chyby a varování, posudky, vrstvy (Pomocný výpočet, Ověření v Pythonu), deník návrhů | `sheetContext` a stav listu, který dnes jde do chatu (`prepareBriefing` → `state`) |
| `sheet_trace` | Z čeho se veličina počítá | `kalketa trace` v CLI |
| `theory_get` | Úseky Podkladů a knihoven teorie podle dotazu, s id pro citace | výběr teorie z chatu (`theorySearch`) |
| `language_guide` | Přehled jazyka výpočtu a pravidla zápisu podle úrovně podrobnosti | `languageGuide()`, `writingRules()` |
| `catalog` / `formula_get` / `sample_get` | Katalog knihovny vzorců a vzorů, obsah na vyžádání | `logic/aiCatalog.ts` (hotové 2026-11-08) |
| `tabs_list` | Otevřené listy: název, uložen/neuložen, aktivní | záložky editoru |

Pravidla zápisu (kap. 9, `writingRules`, pravidlo pro Python) jsou jako **MCP prompt** `kalketa_rules` a jako text v popisu serveru. Klient je dostane bez zvláštního dotazu, podobně jako je dnes model dostává v podkladech.

### Návrhy (fáze 2)

| Nástroj | Co dělá |
|---|---|
| `propose_change` | Blok změny jako v chatu: `{ replace: "12-14" \| after: 14, lines: [...], note }`. Více bloků v jednom volání patří k sobě a jdou přijmout naráz. Kalketa je zapíše do deníku (vrstva Poznámky AI), ukáže karty a **hned spočítá list se změnami**. Odpověď nástroje: id návrhu, chyby, varování, čísla v textu, která list nepočítá, neprošlé posudky. Je to totéž, co dnes dělá kontrola navrženého listu (`checkProposedSheet`, `sheetReport`). |
| `proposal_status` | Stav návrhu: otevřený, přijatý, odmítnutý, nahrazený, nesedí (list se mezitím změnil). AI se může zeptat, než pokračuje. |
| `propose_new_sheet` | Celý nový výpočet, karta „Otevřít jako nový list“ (dnes blok `sheet`). |

Opravený návrh **nahradí** předchozí stejného klienta: hotové od 2026-11-07, `replaces` a `replacedBy` v deníku.

### Kontroly a výstupy (fáze 3)

| Nástroj | Co dělá |
|---|---|
| `python_check` | Spustí skript ve vestavěném Pythonu (Pyodide, bez souborů a sítě, 30 s) a vrátí tabulku výsledků vedle hodnot listu. Před prvním spuštěním se Kalketa zeptá (Povolit jednou / vždy pro toto připojení / Odmítnout). |
| `print_pdf` | Tisk aktivního listu do PDF. Cestu volí člověk v dialogu, AI ji nezadává. |

Co AI přes MCP **nesmí**: zapisovat do listu bez karty, ukládat, zavírat, mazat soubory, měnit nastavení, číst soubory mimo otevřené listy.

## Co Kalketa uloží

Každé připojení je v listu **rozhovor** ve vrstvě Poznámky AI, se jménem klienta (např. „Claude Desktop přes MCP“). Zapíše se jen to, co šlo přes Kalketu: volání nástrojů, návrhy, výsledky kontrol. Samotný rozhovor s AI zůstává v klientovi a Kalketa ho nevidí. Karty návrhů, nahrazení a přijetí fungují jako u chatu. Protokol AI v tisku tak ukáže i práci přes MCP.

## Bezpečnost

- Jen `127.0.0.1`, náhodný token (64 hex) při prvním zapnutí, kontrola hlavičky `Origin`, aby list nemohla ovládat webová stránka v prohlížeči.
- Vypnuto ve výchozím stavu, pauza do zavření programu, režim jen číst.
- Firemní pravidla AI (`AiPolicy`): když zakazují AI, server nejde zapnout.
- Velikost požadavku a počet volání za minutu omezené (jako CivilKit), aby smyčka klienta nezahltila editor.

## Architektura

- **Hlavní proces** (`packages/desktop/src/mcp.ts`, nový): HTTP server s protokolem MCP (balíček `@modelcontextprotocol/sdk`, MIT) a token. Nástroje předává přes IPC do editoru a čeká na odpověď s časovým limitem.
- **Editor** (`packages/editor/src/logic/mcpTools.ts`, nový): provede nástroj nad aktivním dokumentem stejnými funkcemi jako chat. Kontext listu, zápis do deníku, kontrola navrženého listu, katalog a Python jsou hotové a jen se znovu použijí.
- **Most pro Claude Desktop** (`packages/desktop/mcp-bridge/`, nový, asi 50 řádků): stdio ↔ HTTP na `127.0.0.1`. Do `.mcpb` se zabalí s manifestem, port a token doplní Kalketa při ukládání rozšíření.
- **Jádro, sheet a ai se nemění.** Nástroje jsou tenká vrstva nad tím, co už chat používá.

## Ověření

- Unit testy nástrojů nad dokumentem (bez okna).
- **Smoke se skutečným vstupem:** při startu smoke testu zapne MCP v Nastavení klikáním, připojí klienta ze SDK, zavolá `sheet_get`, potom `propose_change` s chybou (vrátí ji) a s opravou. Karta se objeví v okně, přijme se skutečným kliknutím a list obsahuje řádky jednou. Pak `python_check` a odmítnutí v dotazu.
- Ruční zkouška s Claude Code a s Claude Desktop přes `.mcpb` na uživatelově počítači.

## Fáze a odhad

| Fáze | Obsah | Odhad |
|---|---|---|
| 1 | Server, okno nastavení, stav, čtecí nástroje, Claude Code | 1 den |
| 2 | Návrhy s kontrolou, karty, rozhovor v listu, nahrazení | 1 den |
| 3 | Python, PDF, most a `.mcpb` pro Claude Desktop | 1 den |
| 4 | Wiki: návod pro Claude Desktop, Claude Code, Cursor | půl dne |

## Otázky k rozhodnutí

1. **Výchozí stav:** vypnuto (doporučuji, Kalketa je bez AI, dokud ji člověk nezapne), nebo zapnuto jako u CalcSheet?
2. **Přímý zápis:** jen návrhy s kartou (doporučuji), nebo volba „Dovolit AI zapisovat přímo“ pro zkušené?
3. **Co uvidí AI:** jen aktivní list (doporučuji), nebo všechny otevřené?
4. **Pořadí klientů:** Claude Code hned ve fázi 1 (umí HTTP), Claude Desktop přes `.mcpb` ve fázi 3. Nebo Claude Desktop dřív, když ho používáte víc?
5. **Bezplatná API** (Gemini, OpenRouter, Groq jako hotové položky v nastavení chatu): udělat před MCP jako rychlou věc, nebo po něm?
