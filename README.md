# Kalketa

Obecný technický výpočtář jako Mathcad, který umí dobře pracovat s daty.
Tabulky, obrázky a zdroje jsou součástí výpočtu (listu), ne programu.

## Dokumentace

- [Filozofie](docs/01-filozofie.md)
- [Architektura a plán realizace](docs/02-architektura.md)
- [Jazyk výpočtu](docs/03-jazyk.md)

## Vývoj

```bash
npm install
npm test          # všechny testy (jednotkové, architektura, referenční výpočty)
npm run typecheck # kontrola typů
npm run build     # sestavení (potřeba pro příkazovou řádku)
```

Stav projektu určují testy, ne ručně psané zprávy.

## Editor

```bash
npm run editor      # spustí editor na http://localhost:5173
npm run build:editor
```

## Příkazová řádka

```bash
node packages/cli/dist/main.js run reference/R1-nosnik/nosnik.cc --lang cs
node packages/cli/dist/main.js trace reference/R1-nosnik/nosnik.cc σ --lang cs
node packages/cli/dist/main.js print reference/R1-nosnik/nosnik.cc --lang cs --out nosnik.html --pdf nosnik.pdf
node packages/cli/dist/main.js pack reference/R1-nosnik/nosnik.cc --out nosnik.kalk
node packages/cli/dist/main.js unpack nosnik.kalk --into nosnik
node packages/cli/dist/main.js import-table katalog.xlsx --name Profily --into nosnik
```

## Struktura

```text
packages/core/   výpočetní jádro (bez UI, souborů a znalosti oboru)
packages/i18n/   překlady hlášení a popisků, formát čísel
packages/sheet/  tabulky (CSV, Excel), soubor listu .kalk
packages/render/ tisková vrstva: klasický technický výpočet (HTML + MathML)
packages/cli/    příkazová řádka
packages/editor/ editor (React): list s živým přepočtem, tabulky, původ hodnot, tisk
reference/       referenční výpočty R1–R6 s ověřenými výsledky
tests/           testy celého repozitáře (pravidla architektury)
docs/            filozofie, architektura, jazyk
```
