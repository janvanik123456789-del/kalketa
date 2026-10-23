"""Own drawing for sample R20: a 1 m strip of a slab, its bars Ø12/150 at the bottom, h, c and d."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
CONCRETE = '#e9ecef'
STEEL = '#d1495b'
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


def vdim(x, y1, y2, label, sub='', side='end'):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM) + head(x, y2, 1.5708, DIM) + var(x + dx, (y1 + y2) / 2 + 5, label, sub, 14, anchor=side)


def hdim(x1, x2, y, label):
    return line(x1, y, x2, y, DIM, 1) + head(x1, y, 3.14159, DIM) + head(x2, y, 0, DIM) + note((x1 + x2) / 2, y - 6, label, 12, color=INK)


def drawing():
    w, h = 680, 230
    scale = 0.55                       # px per mm: the 1000 mm strip 550 px wide
    left, top = 80, 70
    width, depth = 1000 * scale, 200 * scale
    bottom = top + depth
    c, bar = 25 * scale, 12 * scale
    axis = bottom - c - bar / 2        # the centre of the bars: d from the top
    b = []
    # The concrete, broken off at both sides (the slab goes on).
    b.append(f'<rect x="{left}" y="{top}" width="{width}" height="{depth}" fill="{CONCRETE}" stroke="{INK}" stroke-width="1.8"/>')
    for x in (left, left + width):
        b.append(f'<path d="M{x} {top - 8} l6 {depth * 0.35} l-12 {depth * 0.3} l6 {depth * 0.35 + 16}" fill="none" stroke="{INK}" stroke-width="1.2"/>')
    # Bars Ø12 every 150 mm, the first 75 mm from the edge of the strip.
    for k in range(7):
        x = left + (75 + 150 * k) * scale
        b.append(f'<circle cx="{x:.1f}" cy="{axis:.1f}" r="{bar / 2:.1f}" fill="{STEEL}" stroke="{INK}" stroke-width="0.8"/>')
    # The distribution bars Ø6 across, just above the main bars.
    b.append(line(left + 4, axis - bar / 2 - 2, left + width - 4, axis - bar / 2 - 2, DIM, 2.2))
    b.append(note(left + width - 8, axis - bar / 2 - 8, 'rozdělovací Ø6/200', 10, 'end'))
    # Dimensions: h on the left, d and c on the right, the spacing below.
    b.append(vdim(left - 22, top, bottom, 'h'))
    b.append(vdim(left + width + 26, top, axis, 'd', side='start'))
    b.append(vdim(left + width + 26, axis + bar / 2, bottom, 'c', side='start'))
    b.append(line(left + width, axis, left + width + 32, axis, DIM, 0.6, '3 3'))
    x0, x1 = left + 75 * scale, left + 225 * scale
    b.append(hdim(x0, x1, bottom + 26, 's = 150 mm'))
    b.append(line(x0, axis, x0, bottom + 32, DIM, 0.6, '3 3') + line(x1, axis, x1, bottom + 32, DIM, 0.6, '3 3'))
    b.append(hdim(left, left + width, top - 26, 'b = 1 000 mm (pruh desky)'))
    b.append(note(left + 610 * scale, bottom + 30, 'nosná výztuž Ø12', 11, 'start', STEEL))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'deska.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('deska.svg')
