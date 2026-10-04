# Nápady a úkoly na později

Seznam věcí, které vznikly během práce a čekají na své místo. Nejnovější nahoře.

## Okno rozhovoru s AI

### Rozbalovací řádek „přemýšlení“ (2026-10-04)

Lokální model s přemýšlením může před odpovědí přemýšlet i několik minut. Uživatel zatím vidí jen „přemýšlí… 240 s“.

- Při čekání ukazovat **sbalený řádek s průběžným přemýšlením modelu**, který si uživatel může rozbalit. Zabaví ho to a uvidí, že model pracuje a o čem uvažuje.
- Zdroj: lokální servery posílají přemýšlení v proudu jako `reasoning_content` (dnes ho Kalketa jen počítá jako znamení „přemýšlí“). Claude ho vrací jako souhrn při `thinking.display: "summarized"`.
- Přemýšlení se neukládá do souboru (jen odpověď), nebo jen na přání.

### Prázdná odpověď po dlouhém přemýšlení (2026-10-04)

Na „Analyzuj výpočet.“ model přemýšlel asi 4 minuty a pak nedal žádný text. Pravděpodobně vyčerpal celý limit `max_tokens` (8192) přemýšlením (u lokálních modelů se do limitu počítá i přemýšlení). Kalketa uložila prázdnou bublinu.

- Rozpoznat konec kvůli limitu (`finish_reason: "length"` u lokálních serverů, `stop_reason: "max_tokens"` u Clauda) a místo prázdné bubliny napsat, co se stalo: model nestihl odpovědět, zkuste nižší hloubku přemýšlení nebo užší otázku.
- Prázdnou odpověď do rozhovoru neukládat.
- Zvážit vyšší limit pro lokální servery (kontext tvého serveru je 64k) nebo ho odvodit z velikosti kontextu.
