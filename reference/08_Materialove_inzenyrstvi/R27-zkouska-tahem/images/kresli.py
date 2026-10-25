"""Own drawing for sample R27: a round tensile test specimen with threaded heads, before the test (top) and after fracture (bottom), side view."""
from math import atan2, cos, exp, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
UNIT = '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 640, 300

# Specimen geometry in px: radius of the gauge part, of the neck, and the neck half-width.
R_GAUGE = 12.0
R_NECK = 6.5
NECK_W = 55.0
NECK_X = 315.0


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


def rect(x1, y1, x2, y2, fill, width=1.6):
    return f'<rect x="{x1:.1f}" y="{y1:.1f}" width="{x2 - x1:.1f}" height="{y2 - y1:.1f}" fill="{fill}" stroke="{INK}" stroke-width="{width}"/>'


def thread(x1, x2, yt, yb, color=DIM):
    # Short slanted hatch lines standing for the threads of a head.
    out = []
    for x in range(int(x1) + 4, int(x2) - 5, 7):
        out.append(line(x, yt + 3, x + 5, yb - 3, color, 1.0))
    return ''.join(out)


def radius(x):
    # Gauge radius with a smooth neck around NECK_X.
    return R_GAUGE - (R_GAUGE - R_NECK) * exp(-((x - NECK_X) / NECK_W) ** 2)


def drawing():
    b = []

    # ---- Top: before the test -------------------------------------------
    yc = 80.0
    # Gauge part (uniform diameter) between the two heads.
    b.append(rect(200, yc - R_GAUGE, 480, yc + R_GAUGE, UNIT))
    # Threaded heads at both ends.
    for x1, x2 in [(140, 200), (480, 540)]:
        b.append(rect(x1, yc - 22, x2, yc + 22, '#ffffff'))
        b.append(thread(x1, x2, yc - 22, yc + 22))
    # Gauge marks L0 (ticks run across the gauge).
    gx1, gx2 = 245, 415
    for gx in (gx1, gx2):
        b.append(line(gx, yc - 18, gx, yc + 18, INK, 1.4))
    # Dimension L0 below the specimen, with extension lines from the marks.
    dy = 120
    for gx in (gx1, gx2):
        b.append(line(gx, yc + 18, gx, dy + 4, DIM, 1.0))
    b.append(arrow(330, dy, gx1, dy, DIM, 1.0) + arrow(330, dy, gx2, dy, DIM, 1.0))
    b.append(var(330, dy - 8, 'L', '0', 15))
    # Diameter d0 at the right end of the gauge part (inside, just before the right head).
    b.append(arrow(462, yc, 462, yc - R_GAUGE, DIM, 1.0) + arrow(462, yc, 462, yc + R_GAUGE, DIM, 1.0))
    b.append(var(448, yc + 4, 'd', '0', 15, 'end'))
    b.append(note(20, yc + 4, 'před zkouškou', 11, 'start', INK))

    # ---- Bottom: after fracture, halves put together -------------------
    yb = 200.0
    xs = [140 + 5 * i for i in range(71)]  # 140 .. 490
    top = [(x, yb - radius(x)) for x in xs]
    bottom = [(x, yb + radius(x)) for x in reversed(xs)]
    pts = top + bottom
    d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z'
    b.append(f'<path d="{d}" fill="{UNIT}" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>')
    # Heads at both ends (drawn over the gauge ends).
    for x1, x2 in [(80, 140), (490, 550)]:
        b.append(rect(x1, yb - 22, x2, yb + 22, '#ffffff'))
        b.append(thread(x1, x2, yb - 22, yb + 22))
    # Jagged fracture line across the neck.
    r_n = radius(NECK_X)
    fr = []
    n = 7
    for i in range(n + 1):
        y = yb - r_n + 2 * r_n * i / n
        dx = 0 if i in (0, n) else (3 if i % 2 else -3)
        fr.append(f'{NECK_X + dx:.1f} {y:.1f}')
    b.append(f'<polyline points="{" ".join(fr)}" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linejoin="miter"/>')
    # Gauge marks Lu, further apart than L0.
    mx1, mx2 = 185, 445
    for mx in (mx1, mx2):
        b.append(line(mx, yb - 18, mx, yb + 18, INK, 1.4))
    dy = 250
    for mx in (mx1, mx2):
        b.append(line(mx, yb + 18, mx, dy + 4, DIM, 1.0))
    b.append(arrow(315, dy, mx1, dy, DIM, 1.0) + arrow(315, dy, mx2, dy, DIM, 1.0))
    b.append(var(315, dy - 7, 'L', 'u', 15))
    # Small diameter du across the neck, just right of the fracture.
    rx = 355
    ru = radius(rx)
    b.append(arrow(rx, yb, rx, yb - ru, DIM, 1.0) + arrow(rx, yb, rx, yb + ru, DIM, 1.0))
    b.append(var(369, yb + 4, 'd', 'u', 15, 'start'))
    # Force arrows at both ends pointing outward.
    b.append(arrow(74, yb, 36, yb, RED, 1.8))
    b.append(arrow(556, yb, 594, yb, RED, 1.8))
    b.append(var(55, yb - 9, 'F', '', 15, 'middle', RED))
    b.append(var(575, yb - 9, 'F', '', 15, 'middle', RED))
    b.append(note(20, 280, 'po přetržení', 11, 'start', INK))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'tyc.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('tyc.svg')
