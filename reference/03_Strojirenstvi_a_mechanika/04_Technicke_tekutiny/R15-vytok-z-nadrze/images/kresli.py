"""Own drawing for sample R15: a tank on a stand, water to h_1, a hole at the bottom, the jet falling to A."""
from math import atan2, cos, sin, sqrt
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
STEEL = '#c9ced6'
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


def arrow(x1, y1, x2, y2, color=INK, width=1.8):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color, 8)


def vdim(x, y1, y2, label, sub='', side='end'):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM, 6) + head(x, y2, 1.5708, DIM, 6) + var(x + dx, (y1 + y2) / 2 + 5, label, sub, 14, anchor=side)


def hdim(x1, x2, y, label, sub=''):
    return line(x1, y, x2, y, DIM, 1) + head(x1, y, 3.14159, DIM, 6) + head(x2, y, 0, DIM, 6) + var((x1 + x2) / 2, y - 5, label, sub, 14)


def drawing():
    w, h = 640, 400
    ground = 370
    scale = 32                              # px per metre: 6 m stand, 3 m water
    floor = ground - 6 * scale              # the bottom of the tank
    left, right = 150, 150 + 1.8 * scale    # the tank, 0.9 m radius
    level = floor - 3 * scale
    top = level - 30
    b = []
    # Ground, the stand, the tank and its water.
    b.append(line(30, ground, w - 30, ground, INK, 1.8))
    for x in range(34, w - 30, 9):
        b.append(line(x, ground + 8, x + 8, ground, DIM, 0.7))
    for x in (left + 8, right - 8):
        b.append(line(x, floor, x, ground, INK, 3))
    b.append(line(left + 8, floor + 40, right - 8, ground - 40, DIM, 1.2) + line(right - 8, floor + 40, left + 8, ground - 40, DIM, 1.2))
    b.append(f'<rect x="{left}" y="{level}" width="{right - left}" height="{floor - level}" fill="{BLUE}" fill-opacity="0.18"/>')
    b.append(line(left, level, right, level, BLUE, 1.6))
    b.append(f'<path d="M{left} {top} L{left} {floor} L{right} {floor} L{right} {top}" fill="none" stroke="{INK}" stroke-width="2.2"/>')
    # The hole at the bottom on the right, the jet falling to A (a horizontal throw).
    hx, hy = right, floor - 5
    v = sqrt(2 * 9.81 * 3)
    t_fall = sqrt(2 * 6 / 9.81)
    pts = []
    for k in range(41):
        t = t_fall * k / 40
        pts.append((hx + v * t * scale, hy + 0.5 * 9.81 * t * t * scale))
    b.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{BLUE}" stroke-width="3"/>')
    ax, ay = pts[-1]
    b.append(f'<circle cx="{ax:.1f}" cy="{ground:.1f}" r="4" fill="#ffffff" stroke="{INK}" stroke-width="1.6"/>')
    b.append(var(ax + 8, ground - 8, 'A', anchor='start'))
    # The velocity at A along the jet.
    (px, py), (qx, qy) = pts[-3], pts[-1]
    d = sqrt((qx - px) ** 2 + (qy - py) ** 2)
    b.append(arrow(qx - 50 * (qx - px) / d, qy - 50 * (qy - py) / d - 4, qx + 6 * (qx - px) / d, qy - 4 + 6 * (qy - py) / d, RED, 2.4))
    b.append(var(qx - 18, qy - 54, 'v', '3', color=RED, anchor='end'))
    b.append(note(hx + 8, hy - 8, 'otvor S₂', 11, 'start'))
    # Dimensions: water height, stand height, tank radius.
    b.append(vdim(left - 24, level, floor, 'h', '1'))
    b.append(vdim(left - 24, floor, ground, 'h', '2'))
    b.append(line(left - 30, floor, left, floor, DIM, 0.6, '3 3'))
    b.append(hdim((left + right) / 2, right, top - 12, 'r'))
    b.append(line((left + right) / 2, top - 18, (left + right) / 2, level + 4, DIM, 0.8, '10 3 2 3'))
    b.append(note((left + right) / 2, level + 18, 'voda', 11, 'middle', BLUE))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'nadrz.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('nadrz.svg')
