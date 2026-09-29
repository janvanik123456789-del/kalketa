# CalcCanvas

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
```

Stav projektu určují testy, ne ručně psané zprávy.

## Struktura

```text
packages/core/   výpočetní jádro (bez UI, souborů a znalosti oboru)
reference/       referenční výpočty R1–R6 s ověřenými výsledky
tests/           testy celého repozitáře (pravidla architektury)
docs/            filozofie, architektura, jazyk
```
