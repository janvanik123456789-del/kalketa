"""Own drawing for sample R35: a statically indeterminate beam a-b-c-d (top: the model with its load, bottom: the basic system with the unknowns X_1, X_2). The picture holds no words, so there is one file."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
RED = '#a12828'
UNIT = '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""

W, H = 640, 450
XA, XB, XC, XD = 45.0, 295.0, 445.0, 595.0


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def txt(x, y, text, size=13, anchor='middle', color=INK):
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.5, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.5):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def hatch(x1, x2, y):
    # Ground line with short slanted strokes below it.
    out = [line(x1, y, x2, y, INK, 1.5)]
    for x in range(int(x1) + 4, int(x2) + 1, 7):
        out.append(line(x, y, x - 5, y + 6, DIM, 1.0))
    return ''.join(out)


def pin(x, y):
    # Hinged support: triangle with hatched ground.
    return (f'<path d="M{x:.1f} {y:.1f} L{x - 12:.1f} {y + 20:.1f} L{x + 12:.1f} {y + 20:.1f} Z" fill="{UNIT}" stroke="{INK}" stroke-width="1.5"/>'
            + hatch(x - 18, x + 18, y + 20))


def roller(x, y):
    # Sliding support: triangle on two rollers.
    return (f'<path d="M{x:.1f} {y:.1f} L{x - 12:.1f} {y + 17:.1f} L{x + 12:.1f} {y + 17:.1f} Z" fill="{UNIT}" stroke="{INK}" stroke-width="1.5"/>'
            + f'<circle cx="{x - 6:.1f}" cy="{y + 21:.1f}" r="3.5" fill="#ffffff" stroke="{INK}" stroke-width="1.3"/>'
            + f'<circle cx="{x + 6:.1f}" cy="{y + 21:.1f}" r="3.5" fill="#ffffff" stroke="{INK}" stroke-width="1.3"/>'
            + hatch(x - 18, x + 18, y + 25))


def link(x, y):
    # Horizontal bar to a wall on the right: holds the end horizontally.
    out = [line(x, y, x + 18, y, INK, 2.0), f'<circle cx="{x + 18:.1f}" cy="{y:.1f}" r="3" fill="#ffffff" stroke="{INK}" stroke-width="1.3"/>']
    out.append(line(x + 24, y - 14, x + 24, y + 14, INK, 1.5))
    for yy in range(int(y) - 12, int(y) + 14, 7):
        out.append(line(x + 24, yy, x + 29, yy - 5, DIM, 1.0))
    return ''.join(out)


def moment(x, y, r=22):
    # Three quarters of a circle with an arrowhead, anticlockwise on the screen.
    a0, a1 = 0.0, 1.5 * pi
    pts = [(x + r * cos(-a0 - (a1 - a0) * i / 30), y + r * sin(-a0 - (a1 - a0) * i / 30)) for i in range(31)]
    d = 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts)
    ex, ey = pts[-1]
    tx, ty = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
    return f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="1.8"/>' + head(ex, ey, atan2(ty, tx), RED, 8)


def beam(y):
    return line(XA, y, XD, y, INK, 3.0)


def dims(y):
    out = []
    for x1, x2, m in [(XA, XB, '5 m'), (XB, XC, '3 m'), (XC, XD, '3 m')]:
        out.append(arrow((x1 + x2) / 2, y, x1, y, DIM, 1.0) + arrow((x1 + x2) / 2, y, x2, y, DIM, 1.0))
        out.append(txt((x1 + x2) / 2, y - 5, m, 12, 'middle', DIM))
    for x in (XA, XB, XC, XD):
        out.append(line(x, y - 20, x, y + 6, DIM, 0.8))
    for x, n in [(XA, 'a'), (XB, 'b'), (XC, 'c'), (XD, 'd')]:
        out.append(var(x, y + 24, n, size=15))
    return ''.join(out)


def drawing():
    b = []
    # Top: the model with its load.
    y = 80.0
    b.append(beam(y))
    b.append(pin(XA, y) + roller(XB, y) + roller(XD, y) + link(XD + 2, y))
    # Axial load on a-b: arrows pointing to a, just above the beam.
    for x in range(int(XB) - 10, int(XA) + 20, -40):
        b.append(arrow(x, y - 13, x - 28, y - 13, RED, 1.6))
    b.append(var(170, y - 36, 'q', 'x', 14, 'middle', RED) + txt(188, y - 36, '= 20 kN/m', 13, 'start', RED))
    b.append(moment(XC, y))
    b.append(var(XC + 28, y - 28, 'M', 'c', 14, 'start', RED) + txt(XC + 52, y - 28, '= 50 kN·m', 13, 'start', RED))
    b.append(dims(175))

    # Bottom: the basic system, unknowns X_1, X_2.
    y2 = 305.0
    b.append(beam(y2))
    b.append(pin(XA, y2) + roller(XD, y2))
    for x in range(int(XB) - 10, int(XA) + 20, -40):
        b.append(arrow(x, y2 - 13, x - 28, y2 - 13, RED, 1.6))
    b.append(moment(XC, y2))
    b.append(arrow(XB, y2 + 40, XB, y2 + 5, INK, 1.8))
    b.append(var(XB + 10, y2 + 36, 'X', '2', 15, 'start'))
    b.append(arrow(XD + 4, y2, XD + 36, y2, INK, 1.8))
    b.append(var(XD + 22, y2 - 8, 'X', '1', 15))
    b.append(dims(400))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'nosnik.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('nosnik.svg')
