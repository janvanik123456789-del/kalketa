"""Own drawing for sample R14: a dam from the side, water to height h, a strip dy at depth y, its force and arm to O."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
CONCRETE = '#c9ced6'
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


def vdim(x, y1, y2, label, sub='', side='end', color=DIM):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, color, 1) + head(x, y1, -1.5708, color, 6) + head(x, y2, 1.5708, color, 6) + var(x + dx, (y1 + y2) / 2 + 5, label, sub, 14, anchor=side)


def drawing():
    w, h = 640, 330
    base, surface = 290, 70                 # the bottom and the water surface
    face = 300                              # the wetted vertical face of the dam
    crest, toe = face + 40, face + 200      # the crest and the downstream toe at the bottom
    b = []
    # Water to the face, the bottom, the dam.
    b.append(f'<rect x="40" y="{surface}" width="{face - 40}" height="{base - surface}" fill="{BLUE}" fill-opacity="0.10"/>')
    b.append(line(40, surface, face, surface, BLUE, 1.6))
    b.append(f'<path d="M{face - 60} {surface - 7} l8 7 l8 -7" fill="none" stroke="{BLUE}" stroke-width="1.2"/>')
    b.append(f'<path d="M{face} {surface - 30} L{crest} {surface - 30} L{toe} {base} L{face} {base} Z" fill="{CONCRETE}" stroke="{INK}" stroke-width="1.8"/>')
    b.append(line(30, base, w - 30, base, INK, 1.8))
    for x in range(34, w - 30, 9):
        b.append(line(x, base + 8, x + 8, base, DIM, 0.7))
    b.append(f'<circle cx="{toe}" cy="{base}" r="4" fill="#ffffff" stroke="{INK}" stroke-width="1.6"/>')
    b.append(var(toe + 10, base - 8, 'O', anchor='start'))
    # Height of the water.
    b.append(vdim(70, surface, base, 'h'))
    # A strip dy at depth y, its force dF onto the face, its arm r over the bottom.
    ys = surface + (base - surface) * 0.55
    b.append(f'<rect x="{face - 70}" y="{ys - 6}" width="70" height="12" fill="{BLUE}" fill-opacity="0.25" stroke="{BLUE}" stroke-width="1"/>')
    b.append(var(face - 78, ys + 5, 'dy', anchor='end', color=BLUE, size=13))
    b.append(vdim(150, surface, ys, 'y'))
    b.append(line(150, ys, face - 70, ys, DIM, 0.6, '3 3'))
    b.append(arrow(face - 50, ys, face - 2, ys, RED, 2.4))
    b.append(var(face - 28, ys - 10, 'dF', color=RED, size=14))
    b.append(vdim(face + 26, ys, base, 'r', side='start'))
    b.append(line(face, ys, face + 30, ys, DIM, 0.6, '3 3'))
    # The pressure on the face, a triangle from the surface to the bottom, and its resultant F at h/3.
    tri = 110
    px = face - 4
    b.append(f'<path d="M{px} {surface} L{px} {base} L{px - tri} {base} Z" fill="none" stroke="{RED}" stroke-width="1" stroke-dasharray="4 3"/>')
    hf = base - (base - surface) / 3
    b.append(arrow(face - 130, hf, face - 2, hf, RED, 3))
    b.append(var(face - 136, hf + 5, 'F', color=RED, anchor='end'))
    b.append(line(face + 60, hf, face + 120, hf, DIM, 0.6, '3 3'))
    b.append(vdim(face + 110, hf, base, 'H = h/3', side='start'))
    b.append(note(110, surface - 10, 'voda', 11, 'middle', BLUE))
    b.append(note((crest + toe) / 2 + 20, surface + 40, 'hráz', 11))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'hraz.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('hraz.svg')
