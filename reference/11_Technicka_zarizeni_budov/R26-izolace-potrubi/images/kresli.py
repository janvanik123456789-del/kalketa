"""Own drawing for sample R26: cross-section of an insulated steel heating pipe (mineral wool, aluminium foil), with the thermal-resistance chain in series beside it."""
from math import atan2, cos, pi, radians, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
STEEL = '#4a525c'
WATER = '#cfe8fb'
WOOL = '#f6ecc9'
WOOL_DOT = '#b59c5c'
SILVER = '#aab3bc'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 640, 330

# Geometry in millimetres, drawn at S pixels per millimetre.
PIPE_OD = 48.3        # outer diameter of the steel pipe
WALL = 3.2            # steel wall thickness
INS = 50.0            # insulation thickness
S = 240 / (PIPE_OD + 2 * INS)   # D is about 240 px
CX, CY = 190, 160     # centre of the pipe cross-section
R_WATER = (PIPE_OD / 2 - WALL) * S
R_STEEL = (PIPE_OD / 2) * S
R_INS = (PIPE_OD / 2 + INS) * S


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    # Arrowhead with its tip at (x, y); angle is the direction the arrow points to.
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def dimension(x1, y1, x2, y2, color=DIM, width=1.2):
    # Dimension line with arrowheads at both ends.
    return (line(x1, y1, x2, y2, color, width)
            + head(x1, y1, atan2(y1 - y2, x1 - x2), color)
            + head(x2, y2, atan2(y2 - y1, x2 - x1), color))


def circle(cx, cy, r, fill, stroke='none', width=0):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def point(r, deg):
    # Point at radius r and angle deg (screen coordinates, negative angle is up) around the pipe centre.
    return CX + r * cos(radians(deg)), CY + r * sin(radians(deg))


def wave(deg, r0, length=36, color=RED):
    # Small wavy heat-flow arrow leaving the insulation surface radially.
    a = radians(deg)
    ux, uy = cos(a), sin(a)
    vx, vy = -uy, ux
    n = 36
    pts = []
    for i in range(n + 1):
        t = i / n
        r = r0 + t * length
        off = 3.0 * sin(t * 2 * pi * 2.5)
        pts.append(f'{CX + r * ux + off * vx:.1f} {CY + r * uy + off * vy:.1f}')
    tip_x, tip_y = CX + (r0 + length) * ux, CY + (r0 + length) * uy
    return (f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="1.4" stroke-linejoin="round"/>'
            + head(tip_x, tip_y, a, color))


def drawing():
    b = []

    # Pattern for the mineral wool fibres (dots).
    b.append(f'<defs><pattern id="wool" width="6" height="6" patternUnits="userSpaceOnUse">'
             f'<circle cx="1.5" cy="1.5" r="0.9" fill="{WOOL_DOT}"/>'
             f'<circle cx="4.5" cy="4.5" r="0.9" fill="{WOOL_DOT}"/></pattern></defs>')

    # Pipe cross-section, drawn from the outside in: insulation, foil, steel, water.
    b.append(circle(CX, CY, R_INS, WOOL))
    b.append(circle(CX, CY, R_INS, 'url(#wool)'))
    b.append(circle(CX, CY, R_INS, 'none', SILVER, 2.5))
    b.append(circle(CX, CY, R_STEEL, STEEL))
    b.append(circle(CX, CY, R_WATER, WATER))

    # Labels inside the pipe and in the insulation.
    b.append(var(CX, 165, 't', 'm'))

    # Heat flow q leaving the insulation surface (red wavy arrows).
    for deg in (-150, -115, 150):
        b.append(wave(deg, R_INS + 4))
    b.append(var(38, 74, 'q', anchor='end', color=RED))

    # Ambient air of the technical floor.
    b.append(var(24, 262, 't', 'o', anchor='start'))
    b.append(note(24, 277, 'okolí', 10, 'start', INK))

    # Outer diameter D: dimension line below the pipe with guide lines from the insulation sides.
    b.append(line(CX - R_INS, CY + 4, CX - R_INS, 293, DIM, 0.8, '3 3'))
    b.append(line(CX + R_INS, CY + 4, CX + R_INS, 293, DIM, 0.8, '3 3'))
    b.append(dimension(CX - R_INS, 300, CX + R_INS, 300))
    b.append(var(CX + R_INS + 10, 304, 'D', anchor='start'))

    # Pipe outer diameter d: dimension line in the insulation below the pipe, guide lines from the steel sides.
    yd = CY + R_STEEL + 22
    b.append(line(CX - R_STEEL, CY + 4, CX - R_STEEL, yd + 6, DIM, 0.8, '3 3'))
    b.append(line(CX + R_STEEL, CY + 4, CX + R_STEEL, yd + 6, DIM, 0.8, '3 3'))
    b.append(dimension(CX - R_STEEL, yd, CX + R_STEEL, yd))
    b.append(var(CX, yd + 20, 'd'))

    # Insulation thickness delta_iz: short radial dimension in the upper right.
    x1, y1 = point(R_STEEL, -70)
    x2, y2 = point(R_INS, -70)
    b.append(dimension(x1, y1, x2, y2))
    b.append(var(240, 90, 'δ', 'iz', anchor='start'))

    # Right part: thermal-resistance chain in series, from t_m to t_o.
    y = 150                  # height of the chain
    x_m, x_o = 365, 607      # chain ends
    b.append(note(490, 40, 'odpory v řadě', 12, 'middle', INK))
    b.append(var(x_m, 128, 't', 'm'))
    b.append(line(x_m, y, x_o, y, INK, 1.6))
    b.append(f'<circle cx="{x_m}" cy="{y}" r="3" fill="{INK}"/>')
    b.append(f'<circle cx="{x_o}" cy="{y}" r="3" fill="{INK}"/>')
    b.append(var(x_o, 128, 't', 'o'))

    # Three resistors (white boxes drawn over the wire).
    # (centre x, symbol, subscript, label below)
    resistors = [
        (405, 'λ', 't', 'stěna'),
        (475, 'λ', 'iz', 'izolace'),
        (545, 'α', 'e', 'přestup do okolí'),
    ]
    for cx_, name, sub, label in resistors:
        b.append(f'<rect x="{cx_ - 20}" y="{y - 12}" width="40" height="24" fill="#ffffff" stroke="{INK}" stroke-width="1.4"/>')
        b.append(var(cx_, 126, name, sub))
        b.append(note(cx_, 182, label, 10, 'middle', INK))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'potrubi.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('potrubi.svg')
