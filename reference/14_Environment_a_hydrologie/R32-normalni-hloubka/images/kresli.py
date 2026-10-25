"""Own drawing for sample R32: cross-section of a trapezoidal channel at normal depth (bottom width, water depth, side slope)."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
WATER = '#cfe6fb'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 630, 250

# Geometry in pixels: 30 px per metre, channel centred on CX.
SCALE = 30.0
B = 8.0 * SCALE          # bottom width b
Y = 2.14 * SCALE         # water depth y
M = 1.5                  # side slope 1 : 1.5, i.e. 1.5 m horizontal per 1 m vertical
BANK_H = 3.0 * SCALE     # banks rise to 3 m above the bottom
CX = 330.0
YB = 186.0               # y of the channel bottom
SURF = YB - Y            # y of the water surface
TOP_Y = YB - BANK_H      # y of the bank tops
HW_SURF = B / 2 + M * Y  # half of the top width at the water surface
HW_TOP = B / 2 + M * BANK_H


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def formula(x, y, size=14):
    # b + 2·m_s·y with italic variables and a subscript s on m.
    sub = size * 0.72
    return (f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="{size}" fill="{INK}" text-anchor="middle">'
            f'<tspan font-style="italic">b</tspan> + 2·'
            f'<tspan font-style="italic">m</tspan>'
            f'<tspan font-style="italic" font-size="{sub:.1f}" dy="4">s</tspan>'
            f'<tspan dy="-4">·</tspan>'
            f'<tspan font-style="italic">y</tspan></text>')


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def dimension(x1, y1, x2, y2, color=DIM):
    # Dimension line with arrowheads at both ends.
    return (line(x1, y1, x2, y2, color, 1.0)
            + head(x1, y1, atan2(y1 - y2, x1 - x2), color, 6)
            + head(x2, y2, atan2(y2 - y1, x2 - x1), color, 6))


def drawing():
    b = []

    # Soil hatch: short 45 degree strokes outside the slopes and below the bottom.
    n = 12
    for k in range(1, n):
        h = BANK_H * k / n
        yy = YB - h
        xl = CX - B / 2 - M * h
        xr = CX + B / 2 + M * h
        b.append(line(xl, yy, xl - 7, yy + 7, DIM, 1.0))
        b.append(line(xr, yy, xr + 7, yy + 7, DIM, 1.0))
    x = CX - B / 2 + 10
    while x < CX + B / 2 - 6:
        b.append(line(x, YB + 4, x + 6, YB + 10, DIM, 1.0))
        x += 12

    # Water: light blue fill up to the water surface, then the surface line.
    water = [(CX - HW_SURF, SURF), (CX + HW_SURF, SURF), (CX + B / 2, YB), (CX - B / 2, YB)]
    pts = ' '.join(f'{px:.1f},{py:.1f}' for px, py in water)
    b.append(f'<polygon points="{pts}" fill="{WATER}"/>')
    b.append(line(CX - HW_SURF, SURF, CX + HW_SURF, SURF, BLUE, 1.6))

    # Water level symbol (inverted triangle) on the surface.
    sx = CX - 150
    b.append(f'<path d="M{sx - 6:.1f} {SURF - 10:.1f} L{sx + 6:.1f} {SURF - 10:.1f} L{sx:.1f} {SURF:.1f} Z" fill="{BLUE}"/>')

    # Ground: thick outline of the bottom and both slopes up to the bank tops.
    ground = [(CX - HW_TOP, TOP_Y), (CX - B / 2, YB), (CX + B / 2, YB), (CX + HW_TOP, TOP_Y)]
    pts = ' '.join(f'{px:.1f},{py:.1f}' for px, py in ground)
    b.append(f'<polyline points="{pts}" fill="none" stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>')

    # Slope triangle on the left bank: horizontal leg 1.5 (m_s), vertical leg 1.
    vx, vy = CX - HW_TOP, TOP_Y          # corner at the bank top
    rx = vx - M * 30                      # right-angle corner
    hx, hy = rx, vy - 30                  # top corner of the vertical leg
    b.append(line(rx, vy, vx, vy, DIM, 1.2))
    b.append(line(rx, vy, hx, hy, DIM, 1.2))
    b.append(line(hx, hy, vx, vy, DIM, 1.2))
    b.append(var(rx - 6, (hy + vy) / 2 + 5, '1', size=13, anchor='end'))
    b.append(var((rx + vx) / 2, vy + 16, 'm', 's', size=13))

    # Top width at the water surface: dimension line above the water with the formula.
    dim_y = SURF - 14
    b.append(line(CX - HW_SURF, SURF, CX - HW_SURF, dim_y - 4, DIM, 0.8))
    b.append(line(CX + HW_SURF, SURF, CX + HW_SURF, dim_y - 4, DIM, 0.8))
    b.append(dimension(CX - HW_SURF, dim_y, CX + HW_SURF, dim_y))
    b.append(formula(CX, dim_y - 6))

    # Bottom width b below the channel.
    dim_b = YB + 32
    b.append(line(CX - B / 2, YB + 6, CX - B / 2, dim_b + 4, DIM, 0.8))
    b.append(line(CX + B / 2, YB + 6, CX + B / 2, dim_b + 4, DIM, 0.8))
    b.append(dimension(CX - B / 2, dim_b, CX + B / 2, dim_b))
    b.append(var(CX, YB + 48, 'b'))

    # Water depth y: vertical dimension right of the water.
    dx = 605
    b.append(line(CX + HW_SURF + 2, SURF, dx + 5, SURF, DIM, 0.8))
    b.append(line(CX + B / 2 + 2, YB, dx + 5, YB, DIM, 0.8))
    b.append(dimension(dx, SURF, dx, YB))
    b.append(var(dx + 8, (SURF + YB) / 2 + 5, 'y', anchor='start'))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'koryto.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('koryto.svg')
