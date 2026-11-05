"""Own drawing for sample R40: a two-span beam on three supports with a uniform load q and a point load F. Symbols only, so one file serves both languages."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
INK, DIM, RED, FILL = '#1f2328', '#5b6470', '#a12828', '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
W, H = 640, 250
Y = 130
X0, X1, X2 = 50.0, 342.0, 590.0   # 6 m and 4.5 m in about the same scale
XF = (X0 + X1) / 2


def line(x1, y1, x2, y2, color=INK, width=1.5):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'


def var(x, y, name, sub='', color=INK, size=16, anchor='middle'):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def down(x, y1, y2, color, size=7):
    return line(x, y1, x, y2 - 2, color) + f'<path d="M{x:.1f} {y2:.1f} L{x - size * 0.5:.1f} {y2 - size:.1f} L{x + size * 0.5:.1f} {y2 - size:.1f} Z" fill="{color}"/>'


def pin(x):
    out = f'<path d="M{x:.1f} {Y:.1f} L{x - 12:.1f} {Y + 20:.1f} L{x + 12:.1f} {Y + 20:.1f} Z" fill="{FILL}" stroke="{INK}" stroke-width="1.5"/>'
    out += line(x - 18, Y + 20, x + 18, Y + 20)
    for s in range(-16, 19, 7):
        out += line(x + s, Y + 20, x + s - 5, Y + 26, DIM, 1.0)
    return out


def dim(x1, x2, y, name, sub):
    tick = lambda x: line(x, y - 5, x, y + 5, DIM, 1.0)
    label_gap = 16
    mid = (x1 + x2) / 2
    return tick(x1) + tick(x2) + line(x1, y, mid - label_gap, y, DIM, 1.0) + line(mid + label_gap, y, x2, y, DIM, 1.0) + var(mid, y + 5, name, sub, DIM, 15)


parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
# Uniform load over both spans.
parts.append(line(X0, 84, X2, 84, RED))
x = X0
while x <= X2 + 0.1:
    parts.append(down(x, 84, Y - 4, RED, 6))
    x += (X2 - X0) / 18
parts.append(var(X2 + 18, 90, 'q', '', RED))
# The point load stands above the uniform load.
parts.append(down(XF, 28, 80, INK))
parts.append(var(XF + 16, 42, 'F'))
# Beam and supports.
parts.append(line(X0, Y, X2, Y, INK, 3.5))
for x in (X0, X1, X2):
    parts.append(pin(x))
parts.append(var(X0 - 26, Y + 16, 'A'))
parts.append(var(X1 - 26, Y + 16, 'B'))
parts.append(var(X2 + 26, Y + 16, 'C'))
# Dimensions.
parts.append(dim(X0, XF, 180, 'a', ''))
parts.append(dim(X0, X1, 212, 'L', '1'))
parts.append(dim(X1, X2, 212, 'L', '2'))
parts.append('</svg>\n')
with open(os.path.join(OUT, 'nosnik.svg'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(''.join(parts))
