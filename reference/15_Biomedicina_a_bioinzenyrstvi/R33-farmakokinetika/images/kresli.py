"""Own drawing for sample R33: a one-compartment pharmacokinetic model; intravenous dose from a syringe into the body as one compartment, concentration c, elimination with rate k_e."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
FILL = '#e3f0fc'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 520, 220


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


def syringe(cy):
    # Horizontal syringe, needle pointing right; cy is the common axis.
    b = []
    b.append(line(22, cy, 70, cy, INK, 2.2))                                   # plunger rod
    b.append(f'<rect x="66" y="{cy - 9:.1f}" width="6" height="18" fill="{INK}"/>')  # plunger stopper
    b.append(f'<rect x="74" y="{cy - 15:.1f}" width="80" height="30" fill="#ffffff" stroke="{INK}" stroke-width="1.6"/>')  # barrel
    for gx in (92, 112, 132):                                                  # graduation marks
        b.append(line(gx, cy - 15, gx, cy - 9, DIM, 1))
    b.append(f'<rect x="154" y="{cy - 4:.1f}" width="6" height="8" fill="{INK}"/>')  # needle hub
    b.append(line(160, cy, 176, cy, INK, 1.4))                                 # needle
    return b


def drawing():
    b = []

    # Syringe on the left, label and note under it.
    b += syringe(105)
    b.append(var(99, 150, 'D'))
    b.append(note(99, 168, 'nitrožilní dávka', 11, 'middle', DIM))

    # Dose arrow from the needle tip into the body.
    b.append(arrow(182, 105, 228, 105, BLUE, 1.6))

    # Body as one compartment (rounded rectangle).
    b.append(f'<rect x="232" y="40" width="168" height="130" rx="18" ry="18" fill="{FILL}" stroke="{INK}" stroke-width="1.6"/>')
    b.append(note(316, 66, 'tělo (plazma)', 11, 'middle', INK))
    b.append(var(316, 112, 'c', '', 18))
    b.append(var(316, 144, 'V', 'd', 15))

    # Elimination arrow out of the compartment to the right.
    b.append(arrow(404, 105, 470, 105, RED, 1.6))
    b.append(var(437, 96, 'k', 'e', 15))
    b.append(note(437, 124, 'eliminace', 11, 'middle', RED))
    b.append(note(437, 190, 'ledviny, játra', 10, 'middle', DIM))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'kompartment.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('kompartment.svg')
