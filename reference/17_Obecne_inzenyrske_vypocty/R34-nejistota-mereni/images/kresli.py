"""Own drawing for sample R34: a torsion pendulum (disc on a wire) used for the uncertainty of the period measurement; one oscillation is the swing from one extreme to the other and back."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
UNIT = '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 360, 340


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


def drawing():
    b = []
    cx = 160          # axis of the pendulum (x)
    disc_y = 230      # centre of the top face of the disc
    rx, ry = 80, 16   # half-width and half-height of the disc face in perspective
    th = 8            # visible thickness of the disc

    # Fixed support: a horizontal bar with short diagonal hatch lines above it.
    b.append(f'<rect x="90" y="24" width="140" height="8" fill="{INK}"/>')
    for x in range(100, 230, 20):
        b.append(line(x, 24, x - 7, 16, INK, 1.2))

    # Thin wire from the middle of the support down to the top of the disc.
    b.append(line(cx, 32, cx, disc_y - ry, INK, 1.2))

    # Dashed vertical axis through the wire and the disc.
    b.append(line(cx, 40, cx, 290, DIM, 1, '4 3'))

    # Disc: lower rim and side walls first (path), then the top face on top of it.
    b.append(
        f'<path d="M{cx - rx} {disc_y} L{cx - rx} {disc_y + th} '
        f'A{rx} {ry} 0 0 0 {cx + rx} {disc_y + th} L{cx + rx} {disc_y} Z" '
        f'fill="{UNIT}" stroke="{INK}" stroke-width="1.4"/>'
    )
    b.append(
        f'<ellipse cx="{cx}" cy="{disc_y}" rx="{rx}" ry="{ry}" '
        f'fill="{UNIT}" stroke="{INK}" stroke-width="1.4"/>'
    )

    # Curved double-headed arrow below the disc showing the rotational oscillation.
    p0 = (cx - 52, disc_y + 38)
    p1 = (cx, disc_y + 70)
    p2 = (cx + 52, disc_y + 38)
    b.append(
        f'<path d="M{p0[0]} {p0[1]} Q{p1[0]} {p1[1]} {p2[0]} {p2[1]}" '
        f'fill="none" stroke="{BLUE}" stroke-width="1.6" stroke-linecap="round"/>'
    )
    b.append(head(p0[0], p0[1], atan2(p0[1] - p1[1], p0[0] - p1[0]), BLUE))
    b.append(head(p2[0], p2[1], atan2(p2[1] - p1[1], p2[0] - p1[0]), BLUE))
    b.append(var(cx + 66, disc_y + 62, 'φ', '', 15, 'start', BLUE))

    # Small note at the right.
    b.append(note(292, 150, '1 kmit = 2 kyvy', 11, 'middle', INK))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'kyvadlo.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('kyvadlo.svg')
