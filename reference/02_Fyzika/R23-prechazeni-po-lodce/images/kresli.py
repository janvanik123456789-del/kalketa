"""Own drawing for sample R23: a man walks from the stern to the bow of a boat; the centre of mass stays, the boat moves by x."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
WATER = '#2a78d6'
WATER_DARK = '#1d5fb0'
RED = '#d1495b'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 640, 400
PANEL_H = 200
L = 300                       # boat length on screen, px
M_BOAT, M_MAN = 100, 70       # masses, kg
BOW1 = 120                    # bow of the boat in panel 1
S = L * M_MAN / (M_BOAT + M_MAN)   # shift of the boat, about 123.5 px
BOW2 = BOW1 + S               # bow of the boat in panel 2
TX = BOW1 + (M_MAN * L + M_BOAT * L / 2) / (M_BOAT + M_MAN)   # centre of mass, same in both panels


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


def vdim(x, y1, y2, label, sub=''):
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM, 6) + head(x, y2, 1.5708, DIM, 6) + var(x - 8, (y1 + y2) / 2 + 5, label, sub, anchor='end')


def hdim(x1, x2, y, label, sub='', color=DIM, lcolor=INK):
    """Horizontal dimension line with arrow heads at both ends and the label above it."""
    return (line(x1, y, x2, y, color, 1) + head(x1, y, 0, color, 6) + head(x2, y, pi, color, 6)
            + var((x1 + x2) / 2, y - 6, label, sub, color=lcolor))


def man(x, feet):
    """Simple standing figure, 60 px tall, feet at y = feet."""
    hy = feet - 53
    return (f'<circle cx="{x:.1f}" cy="{hy:.1f}" r="7" fill="none" stroke="{INK}" stroke-width="1.6"/>'
            + line(x, feet - 46, x, feet - 22)
            + line(x, feet - 40, x - 10, feet - 30) + line(x, feet - 40, x + 10, feet - 30)
            + line(x, feet - 22, x - 8, feet) + line(x, feet - 22, x + 8, feet))


def panel(top, title, bow, man_x, fig_dx):
    """One panel: water, boat, man, centre of mass, x axis. top = y of the panel's upper edge."""
    b = []
    b.append(note(12, top + 18, title, 11, 'start', DIM))
    # Water band across the whole panel width, with a darker surface line.
    b.append(f'<rect x="40" y="{top + 110}" width="560" height="40" fill="{WATER}" fill-opacity="0.15"/>')
    b.append(line(40, top + 110, 600, top + 110, WATER_DARK, 1.6))
    # Boat hull: top edge L long, bottom edge shorter, bow on the left.
    inset = 22
    b.append(f'<path d="M{bow:.1f} {top + 92} L{bow + L:.1f} {top + 92} L{bow + L - inset:.1f} {top + 124} L{bow + inset:.1f} {top + 124} Z" fill="#e9ecef" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>')
    # Centre of the boat M.
    b.append(f'<circle cx="{bow + L / 2:.1f}" cy="{top + 92}" r="2.5" fill="{INK}"/>')
    b.append(var(bow + L / 2, top + 82, 'M', size=13))
    # Man on the top edge of the hull.
    # The figure stands fig_dx px inside the boat end; the mass point man_x is unchanged.
    b.append(man(man_x + fig_dx, top + 92))
    b.append(var(man_x + fig_dx + 14, top + 48, 'm', size=13, anchor='start'))
    # Common centre of mass T: circle with a cross, same x in both panels.
    b.append(f'<circle cx="{TX:.1f}" cy="{top + 104}" r="7" fill="#ffffff" stroke="{RED}" stroke-width="1.4"/>')
    b.append(line(TX - 5, top + 104, TX + 5, top + 104, RED, 1.2))
    b.append(line(TX, top + 99, TX, top + 109, RED, 1.2))
    b.append(var(TX + 10, top + 84, 'T', color=RED, anchor='start', size=13))
    # x axis below the water, pointing right.
    b.append(arrow(40, top + 166, 596, top + 166, DIM))
    b.append(var(606, top + 170, 'x', anchor='start'))
    return b


def drawing_boat():
    b = []
    # Panel 1: man at the stern, boat at its original place.
    b += panel(0, 'před přechodem', BOW1, BOW1 + L, -14)
    b.append(hdim(BOW1, BOW1 + L, 20, 'L'))

    # Panel 2: man at the bow, boat moved right by x.
    b += panel(PANEL_H, 'po přechodu', BOW2, BOW2, 14)

    # Origin tick and '0' at the old bow position x = 120 in both panels.
    for top in (0, PANEL_H):
        b.append(line(BOW1, top + 160, BOW1, top + 172, INK, 1.2))
        b.append(note(BOW1, top + 188, '0'))
    b.append(line(BOW1, PANEL_H + 20, BOW1, PANEL_H + 160, DIM, 1, '3 3'))
    b.append(hdim(BOW1, BOW2, PANEL_H + 20, 'x', color=BLUE, lcolor=BLUE))

    # The centre of mass stays: one dashed red line through both panels.
    b.append(line(TX, 30, TX, 380, RED, 1.2, '4 3'))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'lodka.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing_boat())
print('lodka.svg')
