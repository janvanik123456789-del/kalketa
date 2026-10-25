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
    body = 'M74 100 L380 100 L380 110 L560 110 L560 190 L380 190 L380 200 L74 200 Z'
    b.append(f'<path d="{body}" fill="{WORK}" stroke="none"/>')
    # The turned surface a little lighter, with fine turning marks.
    b.append(f'<rect x="381" y="111" width="178" height="78" fill="#f8fafb"/>')
    for x in range(390, 560, 8):
        b.append(line(x, 111, x - 3, 189, '#d5dbe1', 0.6))
    b.append(f'<path d="{body}" fill="none" stroke="{INK}" stroke-width="1.4" stroke-linejoin="round"/>')

    # Axis of rotation (dash-dot), through the chuck too.
    b.append(line(4, 150, 600, 150, DIM, 1.0, '10 3 2 3'))

    # Three-jaw chuck in side view: spindle, body with its front face, two of the jaws gripping the workpiece.
    b.append(f'<rect x="6" y="122" width="18" height="56" fill="{CHUCK}" stroke="{INK}" stroke-width="1.1"/>')
    b.append(f'<rect x="22" y="52" width="46" height="196" rx="7" fill="{CHUCK}" stroke="{INK}" stroke-width="1.2"/>')
    b.append(f'<rect x="60" y="58" width="10" height="184" rx="2" fill="#a3abb3" stroke="{INK}" stroke-width="1"/>')
    for top in (True, False):
        k = 1 if top else -1
        y0 = 150 - k * 50   # gripping face on the workpiece surface
        # A stepped jaw: wide at the body, narrow where it holds the workpiece.
        pts = [(70, y0 - k * 34), (106, y0 - k * 34), (106, y0 - k * 16), (96, y0 - k * 16), (96, y0), (70, y0)]
        b.append('<polygon points="' + ' '.join(f'{x},{y}' for x, y in pts) + f'" fill="{JAW}" stroke="{INK}" stroke-width="1"/>')
        # Teeth on the gripping face.
        for x in range(74, 96, 5):
            b.append(line(x, y0 - k * 2.5, x + 2.5, y0, INK, 0.6))
    b.append(line(4, 150, 600, 150, DIM, 1.0, '10 3 2 3'))
    b.append(note(45, 268, 'sklíčidlo', 10, 'middle', INK))

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

    # Turning tool in front of the workpiece (below in the drawing), its shank square to the axis.
    # The tip cuts at the step; the main cutting edge faces the chuck, the way the tool feeds.
    b.append(f'<polygon points="380,190 380,216 410,216" fill="{INSERT}" stroke="{INK}" stroke-width="1"/>')
    b.append(f'<polygon points="374,216 418,216 418,262 374,262" fill="{SHANK}" stroke="{INK}" stroke-width="1"/>')
    b.append(note(426, 244, 'nůž', 10, 'start', INK))

    # Feed f: the tool moves along the axis towards the chuck.
    b.append(arrow(366, 238, 316, 238, BLUE, 1.6))
    b.append(var(341, 230, 'f', '', 15, 'middle', BLUE))

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
