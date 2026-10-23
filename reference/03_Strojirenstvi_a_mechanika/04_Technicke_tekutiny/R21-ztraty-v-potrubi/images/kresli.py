"""Own drawing for sample R21: a garden sprinkler fed by a pump from a tank (suction basket, elbow, nozzle h above the level)."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
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


def head(x, y, angle, color, size=6):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.6):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color, 8)


def vdim(x, y1, y2, label, sub='', side='end'):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM) + head(x, y2, 1.5708, DIM) + var(x + dx, (y1 + y2) / 2 + 5, label, sub, 14, anchor=side)


def pipe(points):
    path = ' '.join(f'{"M" if i == 0 else "L"}{x:.1f} {y:.1f}' for i, (x, y) in enumerate(points))
    return f'<path d="{path}" fill="none" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/><path d="{path}" fill="none" stroke="#dbe7f7" stroke-width="4" stroke-linejoin="round"/>'


def drawing():
    w, h = 640, 330
    level, bottom = 230, 300
    b = []
    # The tank with water, the suction basket at the end of the suction pipe.
    b.append(f'<rect x="40" y="{level}" width="170" height="{bottom - level}" fill="{BLUE}" fill-opacity="0.18"/>')
    b.append(line(40, level, 210, level, BLUE, 1.6))
    b.append(f'<path d="M40 {level - 40} L40 {bottom} L210 {bottom} L210 {level - 40}" fill="none" stroke="{INK}" stroke-width="2.2"/>')
    # Suction L1 down into the tank, the pump, the delivery L2 and the riser L3 up to the nozzle.
    px, py = 280, 200
    nx, ny = 560, 50
    b.append(pipe([(130, 282), (130, py), (px - 18, py)]))
    b.append(pipe([(px + 18, py), (nx, py), (nx, ny + 12)]))
    b.append(f'<rect x="118" y="276" width="24" height="16" rx="3" fill="#ffffff" stroke="{INK}" stroke-width="1.4"/>')
    for k in range(4):
        b.append(line(121 + 6 * k, 279, 121 + 6 * k, 289, DIM, 0.8))
    b.append(note(150, 316, 'sací koš', 10, 'start'))
    b.append(f'<circle cx="{px}" cy="{py}" r="18" fill="#ffffff" stroke="{INK}" stroke-width="2"/>')
    b.append(f'<path d="M{px - 8} {py + 10} L{px + 12} {py} L{px - 8} {py - 10} Z" fill="none" stroke="{INK}" stroke-width="1.4"/>')
    b.append(note(px, py + 34, 'čerpadlo', 11))
    b.append(note(nx - 10, py + 22, 'koleno', 10, 'end'))
    # The nozzle with its jets.
    b.append(f'<rect x="{nx - 12}" y="{ny}" width="24" height="12" rx="2" fill="#ffffff" stroke="{INK}" stroke-width="1.4"/>')
    for dx in (-10, -4, 2, 8):
        b.append(arrow(nx + dx * 0.6, ny, nx + dx * 3, ny - 34, BLUE, 1.2))
    b.append(note(nx - 20, ny + 10, 'tryska: 12 dírek Ø 2,5 mm', 10, 'end'))
    # Lengths along the pipe, the height of the nozzle above the level.
    b.append(note(118, 245, 'L₁', 12, 'end', INK))
    b.append(note((px + nx) / 2, py - 10, 'L₂', 12, 'middle', INK))
    b.append(note(nx + 12, (py + ny) / 2 + 20, 'L₃', 12, 'start', INK))
    b.append(vdim(600, ny + 6, level, 'h', side='start'))
    b.append(line(210, level, 606, level, DIM, 0.6, '3 3'))
    b.append(note(75, level + 40, 'voda', 11, 'middle', BLUE))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'rozprasovac.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('rozprasovac.svg')
