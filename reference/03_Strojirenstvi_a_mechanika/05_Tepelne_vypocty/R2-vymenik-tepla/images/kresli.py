"""Own drawing for sample R2: a double-pipe (tube-in-tube) heat exchanger, longitudinal section, drawn twice: counter-flow above, parallel-flow below."""
from math import atan2, cos, pi, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
WALL = '#9aa3ad'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 680, 330

PIPE_X, PIPE_W = 110, 420     # outer pipe
TUBE_X, TUBE_W = 98, 444      # inner tube, sticks out past the end caps
PIPE_H, TUBE_H = 44, 12
NOZZLE_LEFT, NOZZLE_RIGHT = 160, 480


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    # angle is the direction of travel; the two barbs point back along it
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.4):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def exchanger(b, cy, s):
    """One double-pipe exchanger on the axis cy. s = -1: nozzles on the top side, s = +1: on the bottom side."""
    # Outer pipe with its wall, the two short nozzle stubs, then the inner tube on top.
    b.append(f'<rect x="{PIPE_X}" y="{cy - PIPE_H / 2}" width="{PIPE_W}" height="{PIPE_H}" fill="#ffffff" stroke="{WALL}" stroke-width="3"/>')
    stub_y = cy - PIPE_H / 2 - 26 if s < 0 else cy + PIPE_H / 2
    for x in (NOZZLE_LEFT, NOZZLE_RIGHT):
        b.append(f'<rect x="{x - 5}" y="{stub_y:.1f}" width="10" height="26" fill="#ffffff" stroke="{WALL}" stroke-width="2.5"/>')
    b.append(f'<rect x="{TUBE_X}" y="{cy - TUBE_H / 2}" width="{TUBE_W}" height="{TUBE_H}" fill="#ffffff" stroke="{INK}" stroke-width="1.2"/>')

    # Cold water (BLUE) through the inner tube, left to right.
    b.append(arrow(40, cy, TUBE_X - 2, cy, BLUE, 1.6))
    b.append(arrow(TUBE_X + TUBE_W + 2, cy, 608, cy, BLUE, 1.6))
    b.append(var(62, cy - 14, 't', 'c1', 14))
    b.append(note(62, cy + 18, '20 °C', 11, 'middle', BLUE))
    b.append(var(576, cy - 14, 't', 'c2', 14))
    b.append(note(576, cy + 18, '80 °C', 11, 'middle', BLUE))

    # Hot water (RED) in the annulus, drawn as two short arrows.
    ay = cy + 14
    if s < 0:  # counter-flow: flows right to left
        for x in (230, 410):
            b.append(arrow(x, ay, x - 30, ay, RED, 1.4))
    else:      # parallel-flow: flows left to right
        for x in (200, 380):
            b.append(arrow(x, ay, x + 30, ay, RED, 1.4))

    # Hot-water nozzles. Each arrow runs from the outer end of the stub to the pipe wall.
    outer_y = cy + s * 50
    inner_y = cy + s * 24
    label_y = cy - 42 if s < 0 else cy + 34
    if s < 0:
        # Top drawing: hot water in at the right, out at the left.
        b.append(arrow(NOZZLE_RIGHT, outer_y, NOZZLE_RIGHT, inner_y, RED, 1.6))
        b.append(var(NOZZLE_RIGHT + 8, label_y, 't', 'h1', 14, 'start', RED))
        b.append(note(NOZZLE_RIGHT + 8, label_y + 14, '160 °C', 11, 'start', RED))
        b.append(arrow(NOZZLE_LEFT, inner_y, NOZZLE_LEFT, outer_y, RED, 1.6))
        b.append(var(NOZZLE_LEFT + 8, label_y, 't', 'h2', 14, 'start', RED))
    else:
        # Bottom drawing: hot water in at the left, out at the right.
        b.append(arrow(NOZZLE_LEFT, outer_y, NOZZLE_LEFT, inner_y, RED, 1.6))
        b.append(var(NOZZLE_LEFT + 8, label_y, 't', 'h1', 14, 'start', RED))
        b.append(note(NOZZLE_LEFT + 8, label_y + 14, '160 °C', 11, 'start', RED))
        b.append(arrow(NOZZLE_RIGHT, inner_y, NOZZLE_RIGHT, outer_y, RED, 1.6))
        b.append(var(NOZZLE_RIGHT + 8, label_y, 't', 'h2', 14, 'start', RED))


def drawing():
    b = []
    top_cy, bottom_cy = 92, 222

    exchanger(b, top_cy, -1)
    exchanger(b, bottom_cy, +1)

    # Flow notes at the left.
    b.append(note(20, 24, 'protiproud', 11, 'start', DIM))
    b.append(note(20, 186, 'souproud', 11, 'start', DIM))

    # Small vertical dimension D across the inner tube of the top drawing.
    b.append(line(262, top_cy - TUBE_H / 2, 262, top_cy + TUBE_H / 2, INK, 1))
    b.append(head(262, top_cy - TUBE_H / 2, -pi / 2, INK))
    b.append(head(262, top_cy + TUBE_H / 2, pi / 2, INK))
    b.append(var(276, top_cy - 10, 'D', '', 14, 'start'))

    # Horizontal dimension L under the bottom drawing, with extension lines.
    dim_y = 300
    left_x, right_x = PIPE_X, PIPE_X + PIPE_W
    b.append(line(left_x, bottom_cy + PIPE_H / 2 + 4, left_x, dim_y + 4, DIM, 1, '3 2'))
    b.append(line(right_x, bottom_cy + PIPE_H / 2 + 4, right_x, dim_y + 4, DIM, 1, '3 2'))
    b.append(line(left_x, dim_y, right_x, dim_y, INK, 1))
    b.append(head(left_x, dim_y, pi, INK))
    b.append(head(right_x, dim_y, 0, INK))
    b.append(var((left_x + right_x) / 2, dim_y + 18, 'L', '', 14))

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'vymenik.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('vymenik.svg')
