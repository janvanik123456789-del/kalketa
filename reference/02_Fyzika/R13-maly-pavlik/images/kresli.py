"""Own drawing for sample R13: Pavlík on his bicycle on a straight road, position x, velocity v and acceleration a."""
from math import atan2, cos, sin, radians
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
GREEN = '#1b8a5a'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{d}/>'


def head(x, y, angle, color, size=8):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=2):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def bicycle(cx, ground):
    # Two wheels, the frame, a rider drawn with a few strokes.
    r = 30
    rear, front = (cx - 48, ground - r), (cx + 48, ground - r)
    out = []
    for (x, y) in (rear, front):
        out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{INK}" stroke-width="2"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="2.5" fill="{INK}"/>')
    crank = (cx - 4, ground - r)
    seat = (cx - 18, ground - r - 40)
    bar = (cx + 34, ground - r - 46)
    out.append(f'<path d="M{rear[0]} {rear[1]} L{crank[0]} {crank[1]} L{seat[0]} {seat[1]} Z M{crank[0]} {crank[1]} L{bar[0] - 4} {bar[1] + 8} L{seat[0]} {seat[1]} M{bar[0] - 4} {bar[1] + 8} L{front[0]} {front[1]} M{bar[0] - 4} {bar[1] + 8} L{bar[0]} {bar[1]} l8 0" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>')
    # The rider: body, head, arms, a leg on the pedal.
    hip = (seat[0] + 2, seat[1] - 6)
    shoulder = (cx + 16, ground - r - 80)
    out.append(line(hip[0], hip[1], shoulder[0], shoulder[1], BLUE, 4))
    out.append(f'<circle cx="{shoulder[0] + 12}" cy="{shoulder[1] - 14}" r="11" fill="#ffffff" stroke="{BLUE}" stroke-width="2.4"/>')
    out.append(line(shoulder[0], shoulder[1], bar[0] + 4, bar[1], BLUE, 3))
    out.append(line(hip[0], hip[1], cx + 16, ground - r - 22, BLUE, 3.4) + line(cx + 16, ground - r - 22, crank[0] + 8, crank[1] + 10, BLUE, 3.4))
    return ''.join(out)


def drawing():
    w, h = 640, 250
    ground, origin = 200, 60
    b = [line(30, ground, w - 30, ground, INK, 2)]
    for k in range(34, w - 30, 10):
        b.append(line(k, ground + 7, k + 7, ground, DIM, 0.7))
    # Position axis from the start, the bicycle further on.
    b.append(arrow(origin, ground + 26, w - 50, ground + 26, INK, 1.2) + var(w - 46, ground + 31, 'x', anchor='start'))
    b.append(line(origin, ground - 8, origin, ground + 32, INK, 1.2) + var(origin, ground + 48, '0'))
    b.append(note(origin, ground - 14, 'start: v = 0', 11))
    cx = 380
    b.append(line(cx, ground + 20, cx, ground + 32, INK, 1.2) + var(cx, ground + 48, 'x(t)'))
    b.append(bicycle(cx, ground))
    # Velocity and acceleration in the direction of travel: the acceleration falls with time.
    b.append(arrow(cx + 86, ground - 120, cx + 186, ground - 120, GREEN, 2.4) + var(cx + 192, ground - 115, 'v', anchor='start', color=GREEN))
    b.append(arrow(cx + 86, ground - 90, cx + 146, ground - 90, RED, 2.4) + var(cx + 152, ground - 85, 'a', anchor='start', color=RED))
    b.append(note(cx + 86, ground - 66, 'zrychlení s časem klesá', 11, 'start', RED))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{"".join(b)}</svg>\n'


with open(os.path.join(OUT, 'pavlik.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('pavlik.svg')
