# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
import math

pH, Ka_oct, Ka_HCN, Kw = 8.5, 1.76e-5, 4.93e-10, 1e-14
H = 10 ** -pH
pK = lambda K: -math.log10(K)
c_oct0 = 10 ** (2 * pH - pK(Ka_oct) - pK(Kw))
c_CN0 = 10 ** (2 * pH - pK(Ka_HCN) - pK(Kw))
c_oct = (Kw * H + Ka_oct * Kw) / H**2
c_CN = (Kw * H + Ka_HCN * Kw) / H**2
# pH of the cyanide solution of the simplified concentration: c*H^2 - Kw*H - Ka*Kw = 0
H0 = (Kw + math.sqrt(Kw**2 + 4 * c_CN0 * Ka_HCN * Kw)) / (2 * c_CN0)
print(f"zjednodušeně: c_oct = {c_oct0:.4e}, c_CN = {c_CN0:.4e}")
print(f"s autoprotolýzou: c_oct = {c_oct:.4e}, c_CN = {c_CN:.5e}")
print(f"chyba zjednodušení u kyanidu: {100 * (c_CN - c_CN0) / c_CN:.2f} %")
result("c_oct0", c_oct0, "mol/dm³")
result("c_CN0", c_CN0, "mol/dm³")
result("c_oct", c_oct, "mol/dm³")
result("c_CN", c_CN, "mol/dm³")
result("pH_CN0", -math.log10(H0), "")
```
