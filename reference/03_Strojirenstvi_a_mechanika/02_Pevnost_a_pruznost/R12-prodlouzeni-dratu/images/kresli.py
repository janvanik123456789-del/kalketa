"""Own drawing for sample R12: the wire hanging by its own weight, an element dx at x, the stress growing to the top."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
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


def arrow(x1, y1, x2, y2, color=INK, width=1.8):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color, 8)


def vdim(x, y1, y2, label, side='end'):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM, 6) + head(x, y2, 1.5708, DIM, 6) + var(x + dx, (y1 + y2) / 2 + 5, label, anchor=side, size=14)


def drawing_wire():
    w, h = 560, 330
    wx, top, bottom = 230, 40, 300
    b = []
    # The ceiling it hangs from.
    b.append(line(wx - 70, top, wx + 70, top, INK, 2))
    for k in range(-70, 70, 9):
        b.append(line(wx + k, top, wx + k + 9, top - 9, DIM, 0.8))
    # The wire, its free end below.
    b.append(line(wx, top, wx, bottom, INK, 3))
    b.append(f'<circle cx="{wx}" cy="{bottom}" r="3" fill="{INK}"/>')
    b.append(note(wx + 10, bottom + 4, 'volný konec', 11, 'start'))
    # Its length, and x measured from the free end up to the element dx.
    b.append(vdim(wx - 60, top, bottom, 'l'))
    ey = bottom - (bottom - top) * 0.45
    b.append(f'<rect x="{wx - 6}" y="{ey - 7}" width="12" height="14" fill="{BLUE}" fill-opacity="0.25" stroke="{BLUE}" stroke-width="1.4"/>')
    b.append(var(wx + 12, ey + 5, 'dx', anchor='start', color=BLUE))
    b.append(line(wx - 30, ey, wx - 8, ey, DIM, 0.6) + line(wx - 30, bottom, wx - 8, bottom, DIM, 0.6))
    b.append(vdim(wx - 24, ey, bottom, 'x'))
    # The weight of the part below pulls the element down.
    b.append(arrow(wx + 46, ey + 16, wx + 46, ey + 82, RED, 2.2))
    b.append(var(wx + 54, ey + 64, 'G', 'x', color=RED, anchor='start'))
    b.append(note(wx + 54, ey + 82, 'tíha části pod ním', 11, 'start', RED))
    # The stress beside it: zero at the free end, ρ·g·l at the top.
    base, reach = 400, 110
    b.append(line(base, top, base, bottom, INK, 1.2))
    b.append(f'<path d="M{base} {bottom} L{base + reach} {top} L{base} {top} Z" fill="{RED}" fill-opacity="0.15" stroke="{RED}" stroke-width="1.6"/>')
    b.append(var(base + reach + 6, top + 14, 'σ', 'max', color=RED, anchor='start'))
    b.append(var(base + 6, bottom - 6, 'σ = 0', anchor='start', size=13))
    sy = ey
    b.append(line(base, sy, base + reach * (bottom - sy) / (bottom - top), sy, RED, 1.4, '4 3'))
    b.append(var(base + reach * (bottom - sy) / (bottom - top) + 6, sy + 5, 'σ', 'x', color=RED, anchor='start'))
    b.append(note(base + reach / 2, top - 12, 'napětí v drátu', 11))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'drat.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing_wire())
print('drat.svg')
