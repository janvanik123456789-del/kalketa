"""Own drawing for sample R31: a survey sketch in S-JTSK (X points down, Y points left). Station 517, new points 518 and 550, bearings in gon, angles sigma and omega, distance d."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 420, 420

ST = (300.0, 150.0)  # station 517


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


def bearing_dir(gon):
    """Unit vector in screen coordinates (x right, y down) for a bearing in gon from +X (down), clockwise on the map."""
    b = gon * pi / 200
    return -sin(b), cos(b)


def polar(x, y, gon, dist):
    dx, dy = bearing_dir(gon)
    return x + dist * dx, y + dist * dy


def arc(cx, cy, r, g1, g2, color=DIM):
    """Arc of radius r around (cx, cy) from bearing g1 to bearing g2 (gon), shorter way round."""
    x1, y1 = polar(cx, cy, g1, r)
    x2, y2 = polar(cx, cy, g2, r)
    a1 = atan2(y1 - cy, x1 - cx)
    a2 = atan2(y2 - cy, x2 - cx)
    delta = (a2 - a1 + pi) % (2 * pi) - pi  # signed angle in screen space
    sweep = 1 if delta > 0 else 0           # SVG: 1 = increasing angle
    large = 1 if abs(delta) > pi else 0
    return (f'<path d="M{x1:.1f} {y1:.1f} A{r:.1f} {r:.1f} 0 {large} {sweep} {x2:.1f} {y2:.1f}" '
            f'fill="none" stroke="{color}" stroke-width="1"/>')


def station(x, y):
    """Small triangle centred on the point (survey station symbol)."""
    return (f'<path d="M{x:.1f} {y - 5:.1f} L{x + 5:.1f} {y + 4:.1f} L{x - 5:.1f} {y + 4:.1f} Z" '
            f'fill="#ffffff" stroke="{INK}" stroke-width="1.2"/>')


def drawing():
    b = []
    sx, sy = ST

    # Axis arrows in the top right corner: X down, Y left, common origin.
    ox, oy = 400, 30
    b.append(arrow(ox, oy, ox, oy + 38, INK, 1.4))
    b.append(var(410, oy + 36, 'X', anchor='start'))
    b.append(arrow(ox, oy, ox - 40, oy, INK, 1.4))
    b.append(var(354, oy + 5, 'Y', anchor='end'))
    b.append(note(20, 24, 'S-JTSK', 11, 'start', DIM))

    # Points: 518 at bearing 18.5 gon, 220 px; 550 at bearing 125.77 gon, 150 px.
    p518 = polar(sx, sy, 18.5, 220)
    p550 = polar(sx, sy, 125.77, 150)

    # Reference line from 517 in the +X direction (down), dashed.
    b.append(line(sx, sy, sx, sy + 100, DIM, 1.2, '4 3'))

    # Sight lines.
    b.append(line(sx, sy, p518[0], p518[1], INK, 1.6))
    b.append(line(sx, sy, p550[0], p550[1], BLUE, 1.6))

    # Angle arcs: sigma between reference and 517-518, omega between 517-518 and 517-550.
    b.append(arc(sx, sy, 45, 0, 18.5))
    b.append(arc(sx, sy, 70, 18.5, 125.77))

    # Angle labels placed on the bisector of each arc, outside the arc.
    xs, ys = polar(sx, sy, 9.25, 62)
    b.append(var(xs, ys + 5, 'σ'))
    xo, yo = polar(sx, sy, 72.135, 95)
    b.append(var(xo, yo + 5, 'ω'))

    # Distance d at the middle of 517-550, on the side away from the arc omega.
    ux, uy = bearing_dir(125.77)
    nx, ny = -uy, ux  # normal pointing up-right, away from 518
    mx, my = polar(sx, sy, 125.77, 75)
    b.append(var(mx + 12 * nx, my + 12 * ny + 5, 'd', color=BLUE))

    # Points and labels.
    b.append(station(sx, sy))
    b.append(note(sx + 9, sy - 6, '517', 12, 'start', INK))
    b.append(station(p518[0], p518[1]))
    b.append(note(p518[0] + 10, p518[1] + 4, '518', 12, 'start', INK))
    b.append(f'<circle cx="{p550[0]:.1f}" cy="{p550[1]:.1f}" r="4" fill="{BLUE}"/>')
    b.append(note(p550[0] - 8, p550[1] - 6, '550', 12, 'end', BLUE))

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n')


with open(os.path.join(OUT, 'rajon.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('rajon.svg')
