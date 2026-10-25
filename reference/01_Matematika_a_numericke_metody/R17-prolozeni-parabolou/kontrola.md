# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

NumPy prokládá metodou nejmenších čtverců jinou cestou (rozkladem matice, ne normálními rovnicemi). Součty čtverců odchylek obou křivek postaví vedle hodnot listu.

```python
import numpy as np

x = np.array([1, 2, 3, 4, 5.0])
y = np.array([2.1, 3.9, 4.2, 6.2, 9.1])
P = np.polyfit(x, y, 2)          # koeficienty od nejvyšší mocniny: b_2, b_1, b_0
L = np.polyfit(x, y, 1)
print("parabola:", P.round(5), " přímka:", L.round(5))

result("S_P", float(((y - np.polyval(P, x)) ** 2).sum()))
result("S_L", float(((y - np.polyval(L, x)) ** 2).sum()))
```
