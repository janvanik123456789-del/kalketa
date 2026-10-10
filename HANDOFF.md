# Session Handoff: Kalketa: AI modul, lokální modely, okno rozhovoru, RAG (teorie, citace, hledání, knihovny .kalkt), Podklady jako Word

Date: 2026-10-03

## Where it started
Pokračování po přesunu repa do `E:\AI\Projekt_vypoctare\Kalketa`. Uživatel zvolil integraci AI. Klíč k Claude API nemá (API se platí zvlášť), proto se šlo na lokální modely (LM Studio a vlastní server „strata“ na `127.0.0.1:8080`). Pak okno rozhovoru, RAG podle kap. 9.6 (navrženo v jiném vlákně), přepracování Podkladů na editor ve stylu Wordu a čištění textu z PDF. Uživatel testuje průběžně v desktopové aplikaci na svém souboru `E:\AI\Projekt_vypoctare\Posouzení nosníku N1.kalk`.

## Decisions locked + what shipped
- Odolnost vůči přesunu: `E:\AI\Projekt_vypoctare\Kalketa\scripts\link-workspaces.mjs` (opravuje junctions v node_modules, spouští se před test/typecheck/build/editor), `npm run smoke` (`E:\AI\Projekt_vypoctare\Kalketa\scripts\smoke.mjs`: vlastní fixtures, falešný API server, `KALKETA_SMOKE_EXE` pro zabalené exe, `result.json` vedle screenshotů), paměť v `C:\Users\Admin\.claude\kalketa-memory` přes `autoMemoryDirectory` v `.claude\settings.local.json`. Commity ab2306e a další.
- Ikony nástrojů (sym/fn) v `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\icons.tsx`; text zůstal jen u `if` a `solve`. Commit e1869af.
- Modul AI `E:\AI\Projekt_vypoctare\Kalketa\packages\ai` (vyměnitelný, žádné jiné balíčky projektu): contract, providers (anthropic, lmstudio :1234, ollama :11434, server = libovolná adresa, výchozí `http://127.0.0.1:8080/v1`), settings (+ effort low/medium/high), policy (`ai-policy.json` vedle exe; `theoryFolder`), briefing (anglicky, odpovědi v jazyce uživatele), citations, theorySearch. `@kalketa/ai/connect` jen v hlavním procesu desktopu (Claude přes oficiální SDK s fallbacks/effort; lokální přes OpenAI-style `/v1/models` a streamovaný `/v1/chat/completions`). Klíče drží jen `E:\AI\Projekt_vypoctare\Kalketa\packages\desktop\src\ai.ts` (safeStorage).
- Okno rozhovoru = režim bočního panelu (`E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\components\ChatPane.tsx`), kontext z `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\logic\aiContext.ts` (text s čísly řádků, chyby, posudky, výsledky, tabulky pojmenované klíčem řádku). Odpovědi v Markdownu (tabulky, kód, odrážky 2 úrovně). Rozhovor se zatím NEukládá do souboru (etapa 2).
- RAG a) teorie = vrstvy Podklady (rozhodnutí uživatele, žádný nový typ vrstvy); nadpisy dostávají stálé `{#T3}` (`E:\AI\Projekt_vypoctare\Kalketa\packages\sheet\src\theory.ts`); citace `[T3]`/`"…" [T3]`/`[T3]: "…"` ověřuje program. b) výběr úseků programem (BM25, kmeny 5 písmen bez diakritiky, celé pod 12 000 znaků). c) knihovny `.kalkt` (`E:\AI\Projekt_vypoctare\Kalketa\packages\sheet\src\theoryLibrary.ts`, `E:\AI\Projekt_vypoctare\Kalketa\packages\desktop\src\theory.ts`, `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\theoryLibraries.ts`): vznikají z Podkladů, připojují se jen pro model (nabídka Teorie v rozhovoru), citace `[PP:T3]`, odkaz + kopie citovaných úseků v `theory/<id>.json` souboru výpočtu, složky projekt → firma → Dokumenty\Kalketa\Teorie. Shodné úseky Podklady/knihovna jdou modelu jednou, z knihovny (ac63175).
- Podklady editor jako Word (TipTap, MIT): `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\components\NotesWord.tsx`, převod `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\logic\notesDoc.ts` (soubor dál ukládá Markdown). Ctrl+V/Z patří editoru, obrázky se vkládají u kurzoru s popiskem (dvojklik mění).
- Vyčistit text z PDF: `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\logic\pdfText.ts` + dialog `components\PdfCleanup.tsx` (spojení řádků, proložených slov, číslované nadpisy, čísla stran, popisky, podezřelé řádky k odškrtnutí, zvýraznění složených slov).
- Dokumentace: `E:\AI\Projekt_vypoctare\Kalketa\docs\01-filozofie.md` kap. 9.6 (rozhodnutí doplněna), `docs\02-architektura.md` (modul AI, rozhovor).

## Key files for next session
- `E:\AI\Projekt_vypoctare\Kalketa\docs\01-filozofie.md` (kap. 9, zejména 9.6): záměr a rozhodnutí k AI a teorii.
- `E:\AI\Projekt_vypoctare\Kalketa\packages\editor\src\logic\pdfText.ts`: místo pro navrhované opravy (viz Pick up here).
- `E:\AI\Projekt_vypoctare\Kalketa\packages\desktop\src\main.ts` (smoke kroky `aiSettingsWithRealInput`, `aiChatWithRealInput`, `pdfCleanupWithRealInput`, `theoryLibraryWithRealInput`) a `E:\AI\Projekt_vypoctare\Kalketa\scripts\smoke.mjs` (falešný server).
- Memory files touched: `C:\Users\Admin\.claude\kalketa-memory\llm-integration-direction.md`, `project-location.md`, `icons-direction.md`, `reply-in-czech.md`, `MEMORY.md` (zrcadleno i v `C:\Users\Admin\.claude\projects\E--AI-Projekt-vypoctare\memory\`).

## Running state
- Background processes: none (všechna spuštění Kalkety skončila)
- Dev servers / ports: none spuštěné z této relace; u uživatele běží lokální LLM: LM Studio `127.0.0.1:1234`, vlastní server strata `127.0.0.1:8080/v1` (model `qwen3.8-flash-next-iq3_xxs`, 64k kontext, OpenAI i Anthropic /v1/messages)
- Open worktrees / branches: none (repo `E:\AI\Projekt_vypoctare\Kalketa`, větev `master`, bez remote; HANDOFF.md netrackovaný)

## Verification: how to confirm things still work
- `npm test` (v `E:\AI\Projekt_vypoctare\Kalketa`): 58 souborů, 557 testů prošlo.
- `npm run typecheck`: bez chyb.
- `npm run smoke`: `smoke: OK` (kontroluje i nastavení AI, rozhovor, citace, Word editor, Ctrl+V, PDF čištění, knihovny; nikdy nesahá na skutečné servery uživatele ani Dokumenty).
- Spuštění pro uživatele: `npm start --workspace @kalketa/desktop` (po smoke je sestaveno) nebo `npm run desktop`; z relace na pozadí s timeoutem 7200000 ms.

## Deferred + open questions
- Hotovo po handoffu (commit 72040d6): Vyčistit text z PDF řadí podpřípady „1.“ pod podkapitolou jako Nadpis 3, přeúrovní i existující číslované nadpisy (s ID), krátké řádky s „(45)“ zvlášť jako vzorce, druhé spuštění nic nemění. Testy 560, smoke OK.
- Deferred: rozhovor ukládat do vrstvy poznámek AI (etapa 2), návrhy změn Přijmout/Odmítnout (etapa 3), výpočet ze záměru (etapa 4).
- Deferred: upozornění, že připojená knihovna má novou verzi; úprava uložené knihovny jinak než novým uložením z Podkladů; varování „chybí zdroj“ u Podkladů.
- Deferred: číslované seznamy, podtržení/přeškrtnutí a vlastní ikony pro odkaz/odrážky/řádky tabulky ve Word editoru; obrázky vložené z Wordu přes schránku.
- Deferred: lepení předložek u proložených slov a slepená slova z PDF (vyžaduje slovník češtiny).
- Open: smazat staré kopie paměti `C:\Users\Admin\.claude\projects\E--AI-Kalketa\memory` a `...\E--AI-Projekt-vypoctare\memory` až nová relace ve složce Kalketa potvrdí načtení `kalketa-memory`; bez souhlasu nemazat.
- Open: výtah z cizí diplomové práce je jen v souboru uživatele a v scratchpadu, do repa se nedává (autorská práva, repo půjde na GitHub).

## Pick up here
Uživatel si má vyzkoušet nové Vyčištění textu z PDF na svém souboru; další kandidát je etapa 2 rozhovoru (ukládání do vrstvy poznámek AI) nebo upozornění na novou verzi připojené knihovny.

## Stav 2026-10-04 (odpoledne)

Hotovo a v gitu (poslední commity `26b9771`, `40e3685`, `d5ebc8d`, `c428a2c`, `9735834`, `b2641cc`, `b30cbfd`, `51d14c3`):

- **AI etapa 3 celá:** návrhy změn (blok ```change```, karta Přijmout/Odmítnout s dopadem, deník `layers/<ai>/entries.json`), značka AI u přijatých řádků do prověření, tisk s upozorněním a značkami, vrstva AI jako protokol v příloze.
- **Paměť:** model zná deník (přijato/odmítnuto/prověřeno); nezapamatované rozhovory se doplní po zapnutí AI.
- **Boční panel se záložkami**, **rozbalovací řádek přemýšlení** v chatu.
- **Studijní podklady A+B:** PDF/HTML/MD ve složkách teorie, pdf.js v hlavním procesu (mezipaměť `userData/study-cache`), úsek = stránka (`[KLÍČ:T45]`), Nástroje → Studijní podklady (výběr kapitol/stránek, karta `<soubor>.kalketa.json`), `@napi-rs/canvas` se nebalí.
- Testy 594, smoke OK (i proti exe).

Další kroky (viz `docs/navrhy/NAPADY-NA-POZDEJI.md`):

1. **Upravený výpočet do nového listu** + „Přijmout všechny návrhy odpovědi“ (přání uživatele 2026-10-04).
2. Studijní podklady etapa C: návrh kapitol podle výpočtu, převod na `.kalkt`.
