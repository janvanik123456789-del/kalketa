"""Own drawing for sample R10: the cube on the bottom, the water pressure on its faces, an element dV_0 at height z."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
WATER = '#2a78d6'
RED = '#d1495b'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.4):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def vdim(x, y1, y2, label, sub=''):
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM, 6) + head(x, y2, 1.5708, DIM, 6) + var(x - 8, (y1 + y2) / 2 + 5, label, sub, anchor='end')


def drawing_cube():
    w, h = 640, 330
    surface, bottom = 50, 280
    scale = (bottom - surface) / 0.3          # px per metre: h = 0.3 m
    a = 0.1 * scale
    left, right, top = 300, 300 + a, bottom - a
    k = 80 / (0.3 * scale)                     # arrow length per px of depth: 80 px at the bottom
    b = []
    # Water above the bottom, its surface, the bottom.
    b.append(f'<rect x="40" y="{surface}" width="{w - 80}" height="{bottom - surface}" fill="{WATER}" fill-opacity="0.07"/>')
    b.append(line(40, surface, w - 40, surface, WATER, 1.6))
    b.append(f'<path d="M{w - 120} {surface - 6} l8 6 l8 -6" fill="none" stroke="{WATER}" stroke-width="1.2"/>')
    b.append(note(w - 104, surface - 12, 'hladina', 11, 'start', WATER))
    b.append(line(40, bottom, w - 40, bottom, INK, 1.8))
    for x in range(44, w - 40, 9):
        b.append(line(x, bottom + 9, x + 9, bottom, DIM, 0.8))
    b.append(note(w - 70, bottom + 24, 'dno', 11))
    # Depth h of the bottom under the surface.
    b.append(vdim(90, surface, bottom, 'h'))
    # The cube.
    b.append(f'<rect x="{left:.1f}" y="{top:.1f}" width="{a:.1f}" height="{a:.1f}" fill="#b9c1cc" stroke="{INK}" stroke-width="1.8"/>')
    b.append(vdim(right + 170, top, bottom, 'a'))
    b.append(line(right + 4, top, right + 174, top, DIM, 0.6, '3 3'))
    # Pressure on the top face: the same all over, p_s = ρ·g·(h − a).
    ps = k * (top - surface)
    for i in range(5):
        x = left + a * (0.1 + 0.8 * i / 4)
        b.append(arrow(x, top - ps - 2, x, top - 2, RED))
    b.append(line(left + a * 0.1, top - ps - 2, left + a * 0.9, top - ps - 2, RED, 1))
    b.append(var(left + a / 2, top - ps - 10, 'p', 's', color=RED))
    # On the side faces: growing with depth, p_v(z) = ρ·g·(h − z).
    for side in (-1, 1):
        edge = left if side < 0 else right
        outline = []
        for i in range(6):
            y = top + a * (0.05 + 0.9 * i / 5)
            length = k * (y - surface)
            x0 = edge + side * (length + 2)
            b.append(arrow(x0, y, edge + side * 2, y, RED))
            outline.append((x0, y))
        b.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in outline)}" fill="none" stroke="{RED}" stroke-width="1"/>')
    b.append(f'<text x="{right + 34:.1f}" y="{top - 10:.1f}" {FONT} font-style="italic" font-size="15" fill="{RED}">p<tspan font-size="10.8" dy="4">v</tspan><tspan dy="-4">(z)</tspan></text>')
    # The z axis from the bottom up, an element dV_0 at height z.
    zx = left - 112
    b.append(arrow(zx, bottom, zx, top - 30, INK, 1.4))
    b.append(var(zx - 8, top - 26, 'z', anchor='end'))
    b.append(var(zx - 8, bottom - 4, '0', anchor='end'))
    zy = bottom - a * 0.42
    size = a * 0.16
    ex = left + a * 0.42
    b.append(f'<rect x="{ex:.1f}" y="{zy - size / 2:.1f}" width="{size:.1f}" height="{size:.1f}" fill="#ffffff" stroke="{INK}" stroke-width="1.2"/>')
    b.append(line(zx, zy, ex - 2, zy, DIM, 0.8, '3 3'))
    b.append(var(zx + 14, zy - 6, 'z', anchor='start', size=13))
    b.append(var(ex + size + 4, zy - size / 2 - 3, 'dV', '0', size=13, anchor='start'))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'krychle.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing_cube())
print('krychle.svg')
