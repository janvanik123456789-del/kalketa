"""Own drawing for sample R36: a quarter-circle gate between river and sea, hinge D, centre O, seal A."""
from math import atan2, cos, sin, radians
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
TEAL = '#1b8a7a'
RED = '#d1495b'
CONCRETE = '#c9ced6'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

WORDS = {
    'cs': {'river': 'řeka', 'sea': 'moře', 'gate': 'uzávěr', 'bed': 'dno'},
    'en': {'river': 'river', 'sea': 'sea', 'gate': 'gate', 'bed': 'bed'},
}


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


def arrow(x1, y1, x2, y2, color=INK, width=1.8, size=8):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color, size)


def dot(x, y):
    return f'<circle cx="{x}" cy="{y}" r="4" fill="#ffffff" stroke="{INK}" stroke-width="1.6"/>'


def drawing(lang):
    w_ = WORDS[lang]
    w, h = 520, 350
    R = 150
    ox, oy = 200, 305                      # centre O, below the hinge
    dx, dy = ox, oy - R                    # hinge D
    ax, ay = ox + R, oy                    # seal A
    river = dy - 70                        # river surface, t above D
    right = 490
    b = []
    # River water on the left, salt water on the right above the arc.
    b.append(f'<rect x="40" y="{river}" width="{ox - 40}" height="{oy - river}" fill="{BLUE}" fill-opacity="0.12"/>')
    b.append(line(40, river, ox, river, BLUE, 1.6))
    b.append(f'<path d="M{dx + 22} {dy} L{right} {dy} L{right} {oy} L{ax} {oy} A{R} {R} 0 0 0 {dx} {dy} Z" fill="{TEAL}" fill-opacity="0.16"/>')
    b.append(line(dx + 22, dy, right, dy, TEAL, 1.6))
    # Wall above the hinge and the bed, hatched.
    b.append(f'<rect x="{dx}" y="{river - 16}" width="22" height="{dy - river + 16}" fill="{CONCRETE}" stroke="{INK}" stroke-width="1.6"/>')
    for y in range(river - 10, dy, 9):
        b.append(line(dx, y + 8, dx + 22, y, DIM, 0.7))
    b.append(line(30, oy, right + 10, oy, INK, 1.8))
    for x in range(34, right + 6, 9):
        b.append(line(x, oy + 8, x + 8, oy, DIM, 0.7))
    # The gate: a quarter-circle sector, vertical edge DO, arc DA, bottom edge OA.
    b.append(f'<path d="M{dx} {dy} A{R} {R} 0 0 1 {ax} {ay} L{ox} {oy} Z" fill="{CONCRETE}" fill-opacity="0.75" stroke="{INK}" stroke-width="2.2"/>')
    b.append(note(ox + 100, oy - 12, w_['gate'], 12))
    # Pressure of the river on the vertical edge: a trapezoid (from rho_F*g*t at D to rho_F*g*(t+R) at O).
    k = 0.55
    w0, w1 = 70 * k, (70 + R) * k
    b.append(f'<path d="M{dx} {dy} L{dx - w0:.1f} {dy} L{dx - w1:.1f} {oy} L{dx} {oy}" fill="none" stroke="{RED}" stroke-width="1.2" stroke-dasharray="4 3"/>')
    for i in range(5):
        y = dy + (oy - dy) * (i + 0.5) / 5
        wd = (70 + (y - dy)) * k
        b.append(arrow(dx - wd, y, dx - 2, y, RED, 1.2, 6))
    # Pressure of the sea on the arc, radial arrows to O (the longer, the deeper).
    for deg in (20, 38, 56, 74):
        a = radians(deg)
        px, py = ox + R * cos(a), oy - R * sin(a)
        depth = py - dy
        ln = 8 + 0.30 * depth
        b.append(arrow(px + ln * cos(a), py - ln * sin(a), px + 2 * cos(a), py - 2 * sin(a), TEAL, 1.2, 6))
    # Hinge D, centre O, seal A.
    b.append(dot(dx, dy))
    b.append(dot(ox, oy))
    b.append(dot(ax, ay))
    b.append(var(dx + 10, dy + 18, 'D', anchor='start'))
    b.append(var(ox + 10, oy - 10, 'O', anchor='start'))
    b.append(var(ax - 6, ay - 10, 'A', anchor='end'))
    # Radius R, dashed, at 45 degrees.
    a45 = radians(66)
    b.append(line(ox, oy, ox + R * cos(a45) - 0.0, oy - R * sin(a45), DIM, 0.9, '4 3'))
    b.append(var(ox + R * cos(a45) / 2 + 6, oy - R * sin(a45) / 2 - 2, 'R', anchor='start', color=DIM, size=14))
    # Weight G down at the arm s_G from the vertical wall.
    sg = R / 3
    b.append(arrow(ox + sg, oy - 90, ox + sg, oy - 40, INK, 2.6))
    b.append(var(ox + sg + 8, oy - 58, 'G', anchor='start'))
    b.append(line(ox, oy - 20, ox + sg, oy - 20, DIM, 1) + head(ox, oy - 20, 3.1416, DIM, 6) + head(ox + sg, oy - 20, 0, DIM, 6))
    b.append(var(ox + sg / 2, oy - 26, 's', 'G', 13, color=DIM))
    # Seal force F_A up at A.
    b.append(arrow(ax, oy + 52, ax, oy + 4, RED, 2.8))
    b.append(var(ax + 10, oy + 40, 'F', 'A', anchor='start', color=RED))
    # Depth t above the hinge and the sea level at the hinge.
    b.append(line(70, river, 70, dy, DIM, 1) + head(70, river, -1.5708, DIM, 6) + head(70, dy, 1.5708, DIM, 6))
    b.append(var(62, (river + dy) / 2 + 5, 't', anchor='end', color=DIM, size=14))
    b.append(line(70, dy, dx, dy, DIM, 0.6, '3 3'))
    # Densities and names.
    b.append(var(100, river + 45, 'ρ', 'F', 16, color=BLUE))
    b.append(var(420, oy - 70, 'ρ', 'S', 16, color=TEAL))
    b.append(note(100, river - 8, w_['river'], 12, 'middle', BLUE))
    b.append(note(430, dy - 10, w_['sea'], 12, 'middle', TEAL))
    b.append(note(110, oy + 24, w_['bed'], 11))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h + 16}" width="{w}" height="{h + 16}"><rect width="{w}" height="{h + 16}" fill="#ffffff"/>{"".join(b)}</svg>\n'


for lang, name in (('cs', 'uzaver.svg'), ('en', 'uzaver.en.svg')):
    with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
        f.write(drawing(lang))
    print(name)
