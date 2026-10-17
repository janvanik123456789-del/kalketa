"""Own drawing for sample R16: a rocket rising vertically, its thrust, weight and exhaust."""
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
    w, h = 460, 540
    ground = 505
    cx = 200                      # the axis of the rocket
    nose, tail = 70, 360          # its tip and the end of its body
    r = 34                        # its half width
    b = []
    # Ground and the launch pad.
    b.append(line(30, ground, w - 30, ground, INK, 1.8))
    for x in range(34, w - 30, 9):
        b.append(line(x, ground + 8, x + 8, ground, DIM, 0.7))
    # The exhaust: a flame below the nozzle, the gases leaving at v_R relative to the rocket.
    b.append(f'<path d="M{cx - 20} {tail + 18} Q{cx} {tail + 110} {cx + 20} {tail + 18} Z" fill="#f2a541" fill-opacity="0.55" stroke="#e07b24" stroke-width="1.4"/>')
    for k in range(5):
        y = tail + 40 + 14 * k
        b.append(f'<circle cx="{cx - 30 + 15 * k:.1f}" cy="{y + 22 * (k % 2):.1f}" r="{5 + k % 3}" fill="{DIM}" fill-opacity="0.25"/>')
    # The body: the fuel inside, the payload (crew) above it, fins at the tail.
    body = f'M{cx} {nose} C{cx + r} {nose + 40} {cx + r} {nose + 70} {cx + r} {nose + 100} L{cx + r} {tail} L{cx - r} {tail} L{cx - r} {nose + 100} C{cx - r} {nose + 70} {cx - r} {nose + 40} {cx} {nose} Z'
    b.append(f'<rect x="{cx - r + 3}" y="{nose + 150}" width="{2 * r - 6}" height="{tail - nose - 153}" fill="#f2a541" fill-opacity="0.25"/>')
    b.append(f'<path d="{body}" fill="none" stroke="{INK}" stroke-width="2.2"/>')
    b.append(line(cx - r, nose + 150, cx + r, nose + 150, INK, 1.2))
    b.append(f'<path d="M{cx - r} {tail - 60} L{cx - r - 26} {tail + 10} L{cx - r} {tail} Z M{cx + r} {tail - 60} L{cx + r + 26} {tail + 10} L{cx + r} {tail} Z" fill="{STEEL}" stroke="{INK}" stroke-width="1.6"/>')
    b.append(f'<path d="M{cx - 14} {tail} L{cx - 20} {tail + 18} L{cx + 20} {tail + 18} L{cx + 14} {tail} Z" fill="{STEEL}" stroke="{INK}" stroke-width="1.4"/>')
    b.append(note(cx, nose + 125, 'posádka', 11))
    b.append(var(cx, nose + 205, 'M', 'p'))
    b.append(note(cx, nose + 225, 'palivo', 11))
    # Forces at the centre: the thrust up, the weight down; the velocity beside.
    mid = (nose + tail) / 2 + 30
    b.append(arrow(cx + r + 70, mid + 60, cx + r + 70, mid - 70, RED, 2.6))
    b.append(var(cx + r + 80, mid - 50, 'F', 't', color=RED, anchor='start'))
    b.append(arrow(cx + r + 120, mid - 20, cx + r + 120, mid + 70, INK, 2.2))
    b.append(var(cx + r + 130, mid + 64, 'm·g', anchor='start'))
    b.append(arrow(cx - r - 50, nose + 160, cx - r - 50, nose + 40, BLUE, 2.4))
    b.append(var(cx - r - 60, nose + 70, 'v', anchor='end', color=BLUE))
    b.append(arrow(cx + 50, tail + 40, cx + 50, tail + 95, '#e07b24', 2.2))
    b.append(var(cx + 60, tail + 90, 'v', 'R', color='#e07b24', anchor='start'))
    b.append(note(cx + 60, tail + 108, 'spaliny vůči raketě', 11, 'start'))
    b.append(note(cx - r - 60, nose + 95, 'kladný směr', 10, 'end'))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'raketa.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('raketa.svg')
