"""Own drawing for sample R22: wall – k1 – m1 – k2 – m2 – k3 – wall, displacements y1 and y2."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
MASS = '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.6):
    a = atan2(y2 - y1, x2 - x1)
    tip = ''.join(f' L{x2 + 8 * cos(a + d):.1f} {y2 + 8 * sin(a + d):.1f}' for d in (2.7, -2.7))
    return line(x1, y1, x2, y2, color, width) + f'<path d="M{x2:.1f} {y2:.1f}{tip} Z" fill="{color}"/>'


def spring(x1, x2, y, coils=6):
    lead = 10
    step = (x2 - x1 - 2 * lead) / (coils * 2)
    pts = [(x1, y), (x1 + lead, y)]
    for i in range(coils * 2):
        pts.append((x1 + lead + step * (i + 0.5), y + (-9 if i % 2 == 0 else 9)))
    pts += [(x2 - lead, y), (x2, y)]
    return f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>'


def wall(x, y1, y2, side):
    d = -1 if side == 'left' else 1
    hatch = ''.join(line(x, y, x + 10 * d, y - 10, DIM, 0.8) for y in range(int(y1) + 10, int(y2) + 1, 10))
    return line(x, y1, x, y2, INK, 2.4) + hatch


def drawing():
    w, h = 640, 190
    y = 95
    left, right = 40, 600
    m1, m2 = (210, 290), (410, 470)          # the masses, the first bigger
    b = [wall(left, 40, 150, 'left'), wall(right, 40, 150, 'right')]
    b.append(line(left, 150, right, 150, DIM, 1))
    b.append(spring(left, m1[0], y) + var((left + m1[0]) / 2, y - 20, 'k', '1'))
    b.append(spring(m1[1], m2[0], y) + var((m1[1] + m2[0]) / 2, y - 20, 'k', '2'))
    b.append(spring(m2[1], right, y) + var((m2[1] + right) / 2, y - 20, 'k', '3'))
    for (x1, x2), name, size in ((m1, '1', 80), (m2, '2', 56)):
        b.append(f'<rect x="{x1}" y="{y - size / 2}" width="{x2 - x1}" height="{size}" fill="{MASS}" stroke="{INK}" stroke-width="1.8"/>')
        b.append(var((x1 + x2) / 2, y + 6, 'm', name))
        # The displacement from the position of rest, to the right.
        cx = (x1 + x2) / 2
        b.append(line(cx, y - size / 2 - 4, cx, y - size / 2 - 26, DIM, 0.8))
        b.append(arrow(cx, y - size / 2 - 20, cx + 40, y - size / 2 - 20, BLUE, 1.6) + var(cx + 46, y - size / 2 - 14, 'y', name, 14, 'start', BLUE))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'hmoty.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('hmoty.svg')
