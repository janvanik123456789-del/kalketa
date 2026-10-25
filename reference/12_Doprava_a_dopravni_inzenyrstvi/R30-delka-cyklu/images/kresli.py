"""Own drawing for sample R30: signal timing diagram of one cycle with three phases.

Each row shows green, amber intergreen and red time over an 80 s cycle; the
cycle length C is shown as a dimension line under the rows."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
UNIT = '#e9ecef'
GREEN = '#3a9d5d'
AMBER = '#e0a030'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 680, 250

X0 = 90          # time 0 s
SCALE = 7        # px per second
CYCLE = 80       # s
BAR_H = 20
ROW_Y = [105, 148, 191]   # row centre lines (fáze 1, 2, 3)


def x_of(t):
    return X0 + t * SCALE


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


def bar(t1, t2, y, color, opacity=None):
    op = f' opacity="{opacity}"' if opacity is not None else ''
    return f'<rect x="{x_of(t1):.1f}" y="{y - BAR_H / 2:.1f}" width="{(t2 - t1) * SCALE:.1f}" height="{BAR_H}" fill="{color}"{op}/>'


def drawing():
    b = []

    # Phases: (green from, green to, intergreen length in s). Red fills the rest.
    phases = [
        (0.0, 25.6, 6.0),
        (31.6, 45.9, 4.0),
        (49.9, 73.0, 7.0),
    ]

    for i, (g_start, g_end, inter) in enumerate(phases):
        y = ROW_Y[i]
        b.append(note(10, y + 4, f'fáze {i + 1}', 12, 'start', INK))
        # Red base for the whole cycle, then green and amber over it.
        b.append(bar(0, CYCLE, y, RED, 0.35))
        b.append(bar(g_start, g_end, y, GREEN))
        b.append(bar(g_end, g_end + inter, y, AMBER))

        # Green label centred above the green bar.
        gx = x_of((g_start + g_end) / 2)
        b.append(var(gx, y - BAR_H / 2 - 5, 'g', str(i + 1), 13))
        # Intergreen label centred above the amber bar (small).
        ix = x_of(g_end + inter / 2)
        b.append(var(ix, y - BAR_H / 2 - 5, 'I', str(i + 1), 11))

    # Dimension line over the whole cycle, below the rows.
    dim_y = 222
    xa, xb = x_of(0), x_of(CYCLE)
    for xt in (xa, xb):
        b.append(line(xt, ROW_Y[-1] + BAR_H / 2 + 4, xt, dim_y + 6, DIM, 0.8, '3 2'))
    mid = (xa + xb) / 2
    b.append(arrow(mid, dim_y, xa, dim_y, INK, 1.2))
    b.append(arrow(mid, dim_y, xb, dim_y, INK, 1.2))
    b.append(var(328, 241, 'C', '', 15, 'start'))
    b.append(note(342, 241, 'délka cyklu', 11, 'start', INK))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'cyklus.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('cyklus.svg')
