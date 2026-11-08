# AI zvenku (MCP)

Vaše AI aplikace (Claude Code, Claude Desktop, Cursor, VS Code a další) se připojí ke Kalketě a pracuje s listem, který máte otevřený: čte ho, vysvětluje, dohledává, odkud se bere který výsledek, a navrhuje změny. Změny přijímáte nebo odmítáte vy, v bočním panelu AI.

## Proč je to udělané takhle

- **Platíte předplatným, které už máte.** Kalketa sama žádnou AI nevolá. Volá ji vaše aplikace, a ta běží na vašem předplatném (Claude, ChatGPT) nebo na místním modelu. K vyzkoušení nepotřebujete kupovat API.
- **Je to povolená cesta.** Předplatné Claude se nesmí používat přihlášením v cizích aplikacích (Anthropic to zakázal v únoru 2026). Oficiální aplikace Clauda se ale k místnímu serveru připojit smí: tak to Anthropic s protokolem MCP zamýšlí.
- **Jeden standard pro všechny aplikace.** MCP (Model Context Protocol) je otevřený standard. Co umí MCP, umí s Kalketou pracovat; Kalketa nemusí znát každou aplikaci zvlášť.
- **AI nic nemění sama.** Každá změna přijde jako návrh na kartě s Přijmout a Odmítnout. Kalketa list se změnou hned přepočítá a chyby vrátí AI dřív, než návrh uvidíte.

## Bezpečnost

- Server je **vypnutý**, dokud ho nezapnete, a běží **jen na tomto počítači** (127.0.0.1). Z jiného počítače ani z webové stránky v prohlížeči se k němu nedostane nic.
- Každý dotaz musí nést **token**. Je to heslo k vašim otevřeným listům: nesdílejte ho. Tlačítko Nový token ten starý zneplatní.
- **Jen číst:** AI smí číst a vysvětlovat, ale ne navrhovat změny. **Pozastavit:** AI dostane jen zprávu, že je spojení pozastavené.
- Pokud firemní pravidla AI zakazují, server zapnout nejde.
- AI vidí list, který máte v okně **aktivní**, a názvy ostatních otevřených listů. Co si přečte, odchází do vaší AI aplikace stejně, jako kdybyste list zkopírovali do jejího okna.

## Postup

1. **Zapněte server:** Nástroje → AI zvenku (MCP)… → Zapnout. Ve stavovém řádku se objeví „MCP: čeká na připojení“.
2. **Připojte aplikaci** jedním ze tří způsobů níže. Stačí jednou; aplikace si to pamatuje.
3. **Ptejte se v aplikaci**, např. „Přečti si list v Kalketě a zkontroluj část 3.“ Aplikace se ke Kalketě připojí sama, když to potřebuje. Kalketa musí běžet a server být zapnutý.
4. **Rozhodujte v Kalketě.** Návrh se ukáže v bočním panelu AI jako karta. Přijetí vrátí Ctrl+Z.

## Tři způsoby připojení

Hotové řádky s vaší adresou, tokenem a cestou ke Kalketě najdete v okně Nástroje → AI zvenku (MCP)…, s tlačítkem Kopírovat.

### Claude Code: příkaz do terminálu

Claude Code umí připojení přes HTTP. Zkopírovaný příkaz `claude mcp add …` spusťte jednou v terminálu (PowerShell). Terminál pak můžete zavřít. Server se načte v **novém** vláknu Claude Code.

### Claude Desktop a aplikace, které server spouštějí jako program

Claude Desktop (a některé další aplikace) neumí místní server přes adresu, jen program, se kterým mluví přes standardní vstup a výstup. Pro ně Kalketa spustí sama sebe s parametrem `--mcp-stdio`: neotevře okno, jen předává zprávy běžící Kalketě. Adresu a token si vezme z nastavení Kalkety, takže v nastavení aplikace nejsou.

Do souboru `%APPDATA%\Claude\claude_desktop_config.json` vložte zkopírovaný blok `mcpServers` (máte-li tam už jiné servery, přidejte jen položku `kalketa`). Claude Desktop pak zavřete a spusťte znovu.

### Cursor, VS Code, Strata, Windsurf, Cline a další: blok mcpServers s adresou

Aplikace, které umí server přes HTTP, dostanou blok s adresou a hlavičkou s tokenem. Vložte ho tam, kam daná aplikace servery MCP zapisuje (např. `.cursor/mcp.json`; u Straty na nejvyšší úroveň jejího souboru nastavení modelu, pak Stratu spustit znovu). Neumí-li aplikace HTTP, použijte blok pro Claude Desktop.

ChatGPT umí zatím jen servery na internetu přes HTTPS, ne místní; s Kalketou ho proto zatím nepropojíte.

## Co AI s Kalketou umí

| Nástroj | Co dělá |
|---|---|
| `tabs_list` | otevřené listy |
| `sheet_get` | aktivní list: očíslované řádky, výsledky, chyby, posudky, deník návrhů |
| `sheet_trace` | odkud se bere hodnota: vzorec, vstupy, řádky tabulek |
| `theory_get` | úseky Podkladů a knihoven teorie k otázce, s id k citaci |
| `language_guide` | jazyk výpočtu a pravidla zápisu |
| `catalog`, `formula_get`, `sample_get` | knihovna vzorců a vzorové výpočty |
| `propose_change` | návrh změny listu, rovnou zkontrolovaný; opravu pošle s `replaces` |
| `proposal_status` | co se s návrhy stalo |
| `withdraw_proposals` | stáhne vlastní zkušební návrhy |
| `propose_new_sheet` | návrh celého nového listu |
| `python_check` | kontrola v Pythonu: Kalketa skript spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu |

S prvním čtením listu dostane AI i krátká pravidla práce s Kalketou (piš s diakritikou, návrh není v listu, dokud ho nepřijmete, Python jen přes `python_check`): některé aplikace úvodní pokyny serveru modelu nepředají.

Co se přes MCP navrhlo, Kalketa uloží do listu jako rozhovor ve vrstvě Poznámky AI. Samotný rozhovor s AI zůstává ve vaší aplikaci.

## Když to nefunguje

- **„port … je obsazený“:** jiný program používá stejný port. Zavřete druhou Kalketu, případně ten program.
- **Aplikace hlásí 401:** token neplatí (byl vytvořen nový). Zkopírujte řádek znovu a aplikaci nastavte znovu.
- **„Kalketa is not running“:** Kalketa neběží nebo je server vypnutý.
- **Aplikace nástroje Kalkety nevidí:** začněte nové vlákno nebo aplikaci restartujte; servery se načítají při startu.
- Každé volání nástroje se zapisuje do `logs\mcp.log` ve složce dat Kalkety.
