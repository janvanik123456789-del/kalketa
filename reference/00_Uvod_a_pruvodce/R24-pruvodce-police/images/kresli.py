"""Own drawing for sample R24: a book shelf on two brackets, the books as a uniform load q, its span L and its cross-section b × t."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
WOOD = '#e8d5b0'
BOOK_FILLS = ('#c9d6e8', '#d9c6c6', '#cfdcc8')
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 640, 260
BOARD_Y, BOARD_T = 150, 12                          # board top and thickness
BOOK_X0 = 110
BOOK_W = [18, 21, 22, 19, 17, 20, 22, 18, 21, 22, 19, 20, 21, 20]   # widths 14–22 px
BOOK_H = [60, 48, 70, 52, 64, 46, 58, 68, 50, 62, 47, 66, 55, 57]   # heights 45–70 px
assert sum(BOOK_W) == 280                           # books fill x = 110 … 390 without gaps
assert all(14 <= w <= 22 for w in BOOK_W) and all(45 <= h <= 70 for h in BOOK_H)


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


def hdim(x1, x2, y, label, sub='', color=DIM, lcolor=INK):
    """Horizontal dimension line with arrow heads at both ends and the label above it."""
    return (line(x1, y, x2, y, color, 1) + head(x1, y, 0, color, 6) + head(x2, y, pi, color, 6)
            + var((x1 + x2) / 2, y - 6, label, sub, color=lcolor))




def bracket(x):
    """Triangle support with its tip at the board bottom, ground line and hatching under its base."""
    tip, base = BOARD_Y + BOARD_T, BOARD_Y + BOARD_T + 20
    b = [f'<polygon points="{x:.1f},{tip} {x - 12:.1f},{base} {x + 12:.1f},{base}" fill="#ffffff" stroke="{INK}" stroke-width="1.4" stroke-linejoin="round"/>']
    b.append(line(x - 16, base, x + 16, base, INK, 1.4))
    for i in range(4):
        hx = x - 14 + i * 8
        b.append(line(hx, base, hx - 5, base + 8, DIM, 0.8))
    return ''.join(b)


def books():
    out, x = [], float(BOOK_X0)
    for i, (w, h) in enumerate(zip(BOOK_W, BOOK_H)):
        fill = BOOK_FILLS[i % 3]
        out.append(f'<rect x="{x:.1f}" y="{BOARD_Y - h}" width="{w}" height="{h}" fill="{fill}" stroke="{INK}" stroke-width="1"/>')
        x += w
    return ''.join(out)


def load():
    """Uniform load q: 9 equal arrows pointing down, tails on one horizontal line."""
    top = 62
    out = [line(100, top, 400, top, BLUE, 1.4)]
    for i in range(9):
        x = 100 + i * 300 / 8
        out.append(arrow(x, top, x, top + 14, BLUE, 1.4))
    out.append(var(400, 54, 'q', color=BLUE))
    return ''.join(out)


def section():
    """Cross-section of the board: width b horizontally, thickness t vertically."""
    cx, cy = 550, 156
    x0, y0 = cx - 60, cy - 9                         # left top corner of the rectangle
    x1, y1 = x0 + 120, y0 + 18
    out = [f'<rect x="{x0}" y="{y0}" width="120" height="18" fill="{WOOD}" stroke="{INK}" stroke-width="1.4"/>']
    out.append(line(x0, 132, x0, y0 - 3, DIM, 0.8))
    out.append(line(x1, 132, x1, y0 - 3, DIM, 0.8))
    out.append(hdim(x0, x1, 128, 'b'))
    xt = 626
    out.append(line(x1 + 3, y0, xt + 4, y0, DIM, 0.8))
    out.append(line(x1 + 3, y1, xt + 4, y1, DIM, 0.8))
    out.append(line(xt, y0, xt, y1, DIM, 1) + head(xt, y0, -pi / 2, DIM, 6) + head(xt, y1, pi / 2, DIM, 6))
    out.append(var(xt + 6, cy + 5, 't', anchor='start'))
    out.append(note(cx, 190, 'průřez prkna'))
    return out


def drawing():
    b = []
    b.append(f'<rect x="70" y="150" width="360" height="12" fill="{WOOD}" stroke="{INK}" stroke-width="1.4"/>')
    for x in (100, 400):
        b.append(bracket(x))
    b.append(books())
    b.append(load())
    b.append(hdim(100, 400, 210, 'L'))
    b += section()
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'police.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('police.svg')
