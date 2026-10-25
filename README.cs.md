# Kalketa

[![Tests](https://github.com/janvanik123456789-del/kalketa/actions/workflows/tests.yml/badge.svg)](https://github.com/janvanik123456789-del/kalketa/actions/workflows/tests.yml)

**Technické výpočty, které jdou zkontrolovat.** Obecný technický výpočtář jako Mathcad, který umí dobře pracovat s daty. Výpočet se píše jako text s jednotkami a tiskne se jako klasický technický výpočet: vzorec, dosazení, výsledek, posudek. Tabulky, obrázky, zdroje a teorie jsou součástí výpočtu (listu), ne programu.

[English](README.md) · licence MIT

## Co umí

- **Jednotky všude**, rozměrová kontrola, °C a K odlišené, měny jako jednotky.
- **Tisk jako ruční výpočet:** vzorec, dosazení, výsledek; posudky s využitím a souhrnem na první straně; ověřované kroky odvození.
- **Data ve výpočtu:** tabulky v listu i z CSV a Excelu, `pick`, `find_min`, interpolace, počítané sloupce a součty.
- **Řešič a analýza:** `solve`, kořeny jako na papíře, diferenciální rovnice, integrály, derivace, proložení naměřených bodů, grafy a plochy ve 3D.
- **Varianty výpočtu** v jednom listu a jejich porovnání `compare`.
- **Přesné výsledky** na vyžádání: `{exact}` ukáže zlomek nebo odmocninu (49/9 ≐ 5,444).
- **Podklady s teorií** ověřovanou jádrem a **Kontrola v Pythonu**, která list přepočítá nezávisle a porovná hodnotu po hodnotě.
- **AI volitelně:** vysvětlí, zkontroluje a navrhne změny, které člověk přijme nebo odmítne. Sama výpočet nemění. Claude nebo lokální model, nebo vůbec.
- **34 vzorových výpočtů** ve všech oborech; 23 z nich jsou řešené příklady z veřejných zdrojů (skripta, sbírky, články), s odkazem na zdroj a nezávisle ověřené.

## Dokumentace

- [Filozofie](docs/01-filozofie.md)
- [Architektura a plán realizace](docs/02-architektura.md)
- [Jazyk výpočtu](docs/03-jazyk.md)

## Vývoj

```bash
npm install
npm test          # všechny testy (jednotkové, architektura, referenční výpočty)
npm run typecheck # kontrola typů
npm run desktop   # sestaví a spustí program
npm run smoke     # program ovládaný skutečnou myší a klávesnicí
npm run smoke:linux  # totéž v Linuxu (WSL)
```

Stav projektu určují testy, ne ručně psané zprávy.

## Editor v prohlížeči

```bash
npm run editor      # spustí editor na http://localhost:5173
npm run build:editor
```

## Příkazová řádka

```bash
npm run build
node packages/cli/dist/main.js run reference/04_Stavebnictvi_a_pozemni_stavby/R1-nosnik/nosnik.cc --lang cs
node packages/cli/dist/main.js trace reference/04_Stavebnictvi_a_pozemni_stavby/R1-nosnik/nosnik.cc σ --lang cs
node packages/cli/dist/main.js print reference/04_Stavebnictvi_a_pozemni_stavby/R1-nosnik/nosnik.cc --lang cs --out nosnik.html --pdf nosnik.pdf
node packages/cli/dist/main.js pack reference/04_Stavebnictvi_a_pozemni_stavby/R1-nosnik/nosnik.cc --out nosnik.kalk
node packages/cli/dist/main.js unpack nosnik.kalk --into nosnik
node packages/cli/dist/main.js import-table katalog.xlsx --name Profily --into nosnik
```

## Struktura

```text
packages/core/    výpočetní jádro (bez UI, souborů a znalosti oboru)
packages/i18n/    překlady hlášení a popisků, formát čísel
packages/sheet/   tabulky (CSV, Excel), soubor listu .kalk, vrstvy
packages/render/  tisková vrstva: klasický technický výpočet (HTML + MathML)
packages/chart/   grafy
packages/canvas/  kreslicí plátno
packages/ai/      volitelný pomocník AI
packages/editor/  editor (React): list s živým přepočtem, tabulky, původ hodnot, tisk
packages/desktop/ program pro počítač (Electron)
packages/cli/     příkazová řádka
reference/        vzorové výpočty s ověřenými výsledky, tříděné podle oboru
tests/            testy celého repozitáře (pravidla architektury)
docs/             filozofie, architektura, jazyk
```

## Licence

[MIT](LICENSE). Balíčky třetích stran, které program obsahuje, mají své licence; jejich seznam je v Nápověda → O programu.
