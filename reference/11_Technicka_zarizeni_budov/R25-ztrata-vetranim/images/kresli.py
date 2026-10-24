"""Own drawing for sample R25: a family house with balanced ventilation and heat recovery; supply to the living rooms, exhaust from the wet rooms, air passing through the hall, infiltration through the envelope."""
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

W, H = 680, 330


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
    # Outer wall of the house, then the inner walls (room borders and the hall strip).
    b.append(f'<rect x="40" y="40" width="480" height="250" fill="#ffffff" stroke="{INK}" stroke-width="3"/>')
    walls = [
        (40, 150, 520, 150), (40, 190, 400, 190),                  # top rooms / hall / bottom rooms (hall is open to the right of x 400)
        (250, 40, 250, 150), (370, 40, 370, 150), (445, 40, 445, 150),
        (120, 190, 120, 290), (165, 190, 165, 290), (265, 190, 265, 290),
        (345, 190, 345, 290), (400, 190, 400, 290),
    ]
    for x1, y1, x2, y2 in walls:
        b.append(line(x1, y1, x2, y2, INK, 1.2))

    # Room names.
    for x, y, name in [
        (145, 104, 'Obývací pokoj + KK'), (310, 104, 'Ložnice'), (407, 104, 'Pokoj 1'), (482, 104, 'Pokoj 2'),
        (80, 244, 'Zádveří'), (142, 244, 'WC'), (215, 244, 'Koupelna'), (305, 244, 'Technická m.'), (372, 244, 'Spíž'),
        (460, 174, 'Chodba'),
    ]:
        b.append(note(x, y, name, 10, 'middle', INK))

    # Supply air (přívod) into the top rooms.
    for x, text in [(145, '55 m³/h'), (310, '40'), (407, '20'), (482, '20')]:
        b.append(arrow(x, 58, x, 76, BLUE))
        b.append(note(x + 7, 70, text, 9, 'start', BLUE))

    # Exhaust air (odvod) out of the wet rooms and the kitchen corner.
    for x, y1, y2, text in [(70, 128, 110, '40'), (142, 270, 252, '25'), (215, 270, 252, '50'),
                            (80, 270, 252, '10'), (305, 270, 252, '10')]:
        b.append(arrow(x, y1, x, y2, RED))
        b.append(note(x + 6, (y1 + y2) / 2 + 4, text, 9, 'start', RED))

    # Transfer air along the hall towards the wet rooms (dashed).
    for x1, x2 in [(330, 230), (200, 150)]:
        b.append(line(x1, 170, x2, 170, DIM, 1.2, '4 3') + head(x2, 170, atan2(0, x2 - x1), DIM))

    # Infiltration through the envelope.
    # Each arrow is 26 px long, starts outside the wall and its head points into the house.
    b.append(arrow(16, 120, 42, 120, DIM, 1.4))
    b.append(arrow(544, 120, 518, 120, DIM, 1.4))
    b.append(arrow(300, 16, 300, 42, DIM, 1.4))
    b.append(arrow(460, 314, 460, 288, DIM, 1.4))
    b.append(note(482, 136, 'infiltrace', 9, 'middle', DIM))

    # Ventilation unit with heat recovery, right of the house.
    b.append(f'<rect x="560" y="120" width="100" height="90" fill="{UNIT}" stroke="{INK}" stroke-width="1.4"/>')
    b.append(line(560, 120, 660, 210, INK, 1))
    b.append(note(600, 196, 'ZZT 80 %', 10, 'middle', INK))
    b.append(note(610, 108, 'větrací jednotka', 10, 'middle', INK))

    # Supply from the unit into the house (blue) and exhaust from the house to the unit (red).
    b.append(arrow(558, 140, 522, 140, BLUE, 1.6))
    b.append(note(541, 124, 'přívod', 9, 'middle', BLUE))
    b.append(note(541, 137, '135 m³/h', 9, 'middle', BLUE))
    b.append(arrow(522, 190, 558, 190, RED, 1.6))
    b.append(note(541, 202, 'odvod', 9, 'middle', RED))
    b.append(note(541, 214, '135 m³/h', 9, 'middle', RED))

    # Outdoor air intake below the unit.
    b.append(arrow(610, 218, 610, 240, DIM))
    b.append(note(610, 254, 'venkovní vzduch −15 °C', 9, 'middle', DIM))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'vetrani.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('vetrani.svg')
