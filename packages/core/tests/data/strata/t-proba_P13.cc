# Sonda P13 — porovnávání a délka textu (datum z tabulky se vrací jako text)
text := "2026-06-30"
delka_textu := len(text)
srovnani := text = "2026-06-30"
table Splat:
    | k | datum |
    | 1 | 2026-01-31 |
    | 6 | 2026-06-30 |
nacte := pick(Splat, 6).datum
druhy_text := nacte = "2026-06-30"
check "text se rovná textu": srovnani
check "datum z tabulky se rovná řetězci": druhy_text
