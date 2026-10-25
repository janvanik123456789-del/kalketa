"""Own drawing for sample R29: longitudinal external turning, top view. Workpiece clamped in a chuck, the already turned part from the right end to the tool, the depth of cut a_p, feed f, rotation n and the dimension chain L, l_n, l."""
from math import atan2, cos, radians, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
WORK = '#eef1f4'
TURNED = '#ffffff'
CHUCK = '#8a939c'
JAW = '#c5ccd3'
SHANK = '#4a525c'
INSERT = '#c9d1d9'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 660, 330


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


def dim(x1, y1, x2, y2, color=INK, width=1.0):
    """Dimension line with arrowheads at both ends, the heads point at the extension lines."""
    return (line(x1, y1, x2, y2, color, width)
            + head(x1, y1, atan2(y1 - y2, x1 - x2), color)
            + head(x2, y2, atan2(y2 - y1, x2 - x1), color))


def drawing():
    b = []

    # Workpiece: uncut part (full radius 50 px) from the chuck to the step at x 380,
    # turned part (radius 40 px) from the step to the free right end at x 560.
    b.append(f'<path d="M86 100 L380 100 L380 110 L560 110 L560 190 L380 190 L380 200 L86 200 Z" fill="{WORK}" stroke="none"/>')
    b.append(f'<rect x="381" y="111" width="178" height="78" fill="{TURNED}"/>')
    b.append(f'<path d="M86 100 L380 100 L380 110 L560 110 L560 190 L380 190 L380 200 L86 200 Z" fill="none" stroke="{INK}" stroke-width="1.4" stroke-linejoin="round"/>')

    # Axis of rotation (dash-dot).
    b.append(line(40, 150, 600, 150, DIM, 1.0, '10 3 2 3'))

    # Chuck body and grey jaws gripping the left end.
    b.append(f'<rect x="30" y="84" width="56" height="132" fill="{CHUCK}" stroke="{INK}" stroke-width="1.2"/>')
    b.append(f'<rect x="78" y="92" width="18" height="20" fill="{JAW}" stroke="{INK}" stroke-width="1"/>')
    b.append(f'<rect x="78" y="188" width="18" height="20" fill="{JAW}" stroke="{INK}" stroke-width="1"/>')
    b.append(note(58, 232, 'sklíčidlo', 10, 'middle', INK))

    # Workpiece diameter D (vertical dimension in the left part).
    b.append(dim(118, 100, 118, 200))
    b.append(var(106, 128, 'D', '', 15, 'end'))

    # Depth of cut a_p at the step (radial, 10 px = 5 mm at 2 px per mm).
    b.append(line(380, 100, 406, 100, DIM, 0.8))
    b.append(dim(396, 100, 396, 110))
    b.append(var(410, 106, 'a', 'p', 14, 'start'))

    # Labels of the two parts.
    b.append(note(233, 90, 'neobrobeno', 10, 'middle', DIM))
    b.append(note(475, 100, 'obrobeno', 10, 'middle', DIM))

    # Turning tool below the workpiece: insert with its tip at the step, shank to the right.
    b.append(f'<polygon points="380,200 394,200 394,214" fill="{INSERT}" stroke="{INK}" stroke-width="1"/>')
    b.append(f'<rect x="394" y="200" width="96" height="26" fill="{SHANK}"/>')
    b.append(note(496, 216, 'nůž', 10, 'start', INK))

    # Feed f (blue arrow moving left, under the tool).
    b.append(arrow(460, 248, 400, 248, BLUE, 1.6))
    b.append(var(430, 264, 'f', '', 15, 'middle', BLUE))

    # Rotation n (red arc around the axis at the free end, arrow pointing down).
    t = radians(60)
    arc_angle = atan2(52 * cos(t), -14 * sin(t))
    b.append(f'<path d="M565 105 A14 52 0 0 1 565 195" fill="none" stroke="{RED}" stroke-width="1.6"/>')
    b.append(head(565, 195, arc_angle, RED))
    b.append(var(590, 154, 'n', '', 15, 'middle', RED))

    # Dimension chain: total L above, segments l_n (approach) and l (machined length) below.
    # Tool start at x 610, right face of the workpiece at x 560, end of the cut at x 120.
    b.append(line(120, 204, 120, 308, DIM, 0.8))
    b.append(line(560, 196, 560, 308, DIM, 0.8))
    b.append(line(610, 204, 610, 308, DIM, 0.8))
    b.append(dim(120, 280, 610, 280))
    b.append(var(365, 274, 'L'))
    b.append(dim(560, 302, 610, 302))
    b.append(var(585, 320, 'l', 'n'))
    b.append(dim(120, 302, 560, 302))
    b.append(var(340, 320, 'l'))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'soustruzeni.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('soustruzeni.svg')
