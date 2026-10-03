# Plán přesunu Kalkety do čistého adresáře

Sepsáno 2026-10-02, provést 2026-10-03 (po resetu týdenního limitu).

## Výchozí stav (E:\AI\Projekt_vypoctare, ~2,6 GB)

| Položka | Velikost | Co to je |
|---|---|---|
| `calccanvas\` | 1 362 MB | Vlastní projekt (git, 221 sledovaných souborů, vše commitnuto) |
| `calccanvas.zip` | 943 MB | Stará záloha celého projektu včetně node_modules |
| `Konkurence\` | 268 MB | Stažené cizí projekty (CalcpadCE, EngineeringPaper, UzonCalc, unit, postgresql-unit) + `CONCURRENCY-ANALYSIS-IMPLEMENTATION.md` |
| `Claude_navrh\` | 0,2 MB | Návrhové dokumenty; `01–03*.md` jsou **identické** s `calccanvas\docs\`, zbytek je `archiv-puvodni-navrhy\` |
| `.claude\launch.json` | — | Konfigurace dev serveru editoru (port 5173) |

## Co je balast uvnitř calccanvas (není v gitu, vše se dá znovu vytvořit)

- `node_modules\` (555 MB) a `packages\editor\node_modules\` (6 MB): obnoví `npm install`
- `packages\desktop\release\` (795 MB): staré instalačky, 2× CalcCanvas + 2× Kalketa 0.1.0, každá ~110 MB
- `packages\*\dist\`, `*.tsbuildinfo`: výstupy buildu

## Postup

*Body 1–3 hotové 2026-10-03: klon v `E:\AI\Kalketa`, testy, desktop, editor (dev server) i Linux ověřené; paměť Claude zkopírovaná do `E--AI-Kalketa`. Bod 4 čeká na rozhodnutí uživatele.*


1. `git clone E:\AI\Projekt_vypoctare\calccanvas E:\AI\Kalketa`: vezme přesně 221 sledovaných souborů i s historií, žádný balast
2. Zkopírovat `.claude\launch.json` a opravit cestu `calccanvas/packages/editor` → `packages/editor`
3. V `E:\AI\Kalketa`: `npm install`, testy, spustit editor a desktop: ověřit, že vše funguje
4. Teprve po ověření: starý adresář archivovat nebo smazat (rozhodne uživatel)

Originál se do bodu 4 nemění, takže přerušení kdykoli je neškodné.

## K rozhodnutí před přesunem

- [ ] **Cíl:** `E:\AI\Kalketa`? (navrženo)
- [ ] **Konkurence\**: přesunout vedle (`E:\AI\Kalketa-reference\`), nechat, nebo smazat? Do repa nepatří (cizí kód, licence).
- [ ] **Claude_navrh\archiv-puvodni-navrhy\**: zahodit, nebo uložit do `docs\archiv\` v repu? (`01–03*.md` jsou duplikáty, ty odpadnou)
- [ ] **calccanvas.zip**: smazat po ověření nové kopie? (git historie ho nahrazuje)
- [ ] **Instalačky v release\**: ponechat si nějakou (např. Kalketa-0.1.0-portable.exe) mimo projekt?
- [ ] **Paměť Claude** je vázaná na cestu projektu (`...\projects\E--AI-Projekt-vypoctare\memory\`): zkopírovat do složky pro novou cestu, aby se v novém adresáři načetla.

## Poznámky

- Referenční příklady v `reference\` mají příponu `.cc`, ale nový formát je `.kalk`. Je to samostatný úkol, s přesunem nesouvisí.
- Adresář repa se pořád jmenuje `calccanvas`; klonem do `E:\AI\Kalketa` se přejmenování vyřeší.

## Po přesunu (2026-10-03): ikony nástrojů a odmocniny

Dohodnuto 2026-10-02. Dělat až v novém adresáři, po ověření přesunu (bod 3).

- **Náhled:** `Claude_navrh\ikony-nastroje.html`. Při přesunu ho **přenést s sebou**, ať se neztratí při archivaci `Claude_navrh\`. Na stránce si uživatel zvolí u každého nástroje text nebo ikonu a výběr vloží do chatu (pole „Výběr ke zkopírování“).
- **Styl:** vlastní kreslené ikony jako v `packages\editor\src\icons.tsx` (20×20, čára 1,5), se zástupnými čtverečky jako v paletách Mathcadu. Phosphor odmítnut.
- **Kombinace:** část nástrojů zůstane jako text (např. obecná mocnina „xⁿ“), zbytek dostane ikonu podle výběru uživatele.

### Kroky

- [x] Získat od uživatele výběr text/ikona (z náhledu): text zůstal jen u Podmínky (if) a Řešení rovnice (solve)
- [x] Jazyk: třetí odmocnina `∛x` jako předpona stejně jako `√` (lexer, parser, výpočet)
- [x] Jazyk: n-tá odmocnina `root(x, n)` (funkce v `core\src\functions\modules.ts`)
- [x] Vykreslení: odmocnina s indexem (MathML `<mroot>` v `render\src\math.ts`), text `∛(…)` a `root(…)`
- [x] Editor: nová tlačítka v toolbaru operátorů (zatím jako text: ∛, ⁿ√, xⁿ; zlomek už je ÷; uložená rozložení lišt je dostanou automaticky) (∛, n-tá odmocnina, obecná mocnina `^`, zlomek `/`) a popisky v `i18n` (cs, en)
- [x] Editor: vybrané ikony do `icons.tsx`; u nástrojů s textem zůstane `glyph` (smoke test kontroluje ikony i text)
- [x] Testy (core, render) a ověření v desktopové aplikaci skutečným klikáním v toolbaru
