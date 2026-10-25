"""Own drawing for sample R28: a feedback control loop with a PID controller (top) and a time plot of sustained oscillation at the critical gain K_c (bottom)."""
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

W, H = 680, 300


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


def block(x, y, w, h, text):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{UNIT}" stroke="{INK}" stroke-width="1.4"/>'
            + note(x + w / 2, y + h / 2 + 4, text, 11, 'middle', INK))


def drawing():
    b = []

    # Top: feedback control loop. The summing point takes w (+) and the feedback (-).
    cy = 90
    cx_s, r_s = 100, 14
    b.append(arrow(20, cy, cx_s - r_s, cy))
    b.append(f'<circle cx="{cx_s}" cy="{cy}" r="{r_s}" fill="#ffffff" stroke="{INK}" stroke-width="1.4"/>')
    b.append(note(94, 85, '+', 12, 'middle', INK))
    b.append(note(100, 101, '−', 12, 'middle', INK))
    b.append(var(52, 82, 'w'))
    b.append(note(52, 48, 'žádaná teplota', 10, 'middle', INK))

    # Error e into the controller, controller output u into the furnace.
    b.append(arrow(cx_s + r_s, cy, 150, cy))
    b.append(var(132, 84, 'e'))
    b.append(block(150, 66, 100, 48, 'regulátor PID'))
    b.append(arrow(250, cy, 290, cy))
    b.append(var(270, 84, 'u'))
    b.append(block(290, 66, 90, 48, 'pec'))

    # Output y to the right, with a branch point feeding back below the loop.
    b.append(arrow(380, cy, 630, cy))
    b.append(var(510, 84, 'y'))
    b.append(note(510, 106, 'teplota', 10, 'middle', INK))
    bx = 450
    b.append(f'<circle cx="{bx}" cy="{cy}" r="3" fill="{INK}"/>')
    b.append(line(bx, cy, bx, 130))
    b.append(line(bx, 130, cx_s, 130))
    b.append(arrow(cx_s, 130, cx_s, cy + r_s + 1))

    # Bottom: time plot of a sustained oscillation at the critical gain.
    ox, oy = 90, 274          # origin
    y_top = 186               # top of the vertical axis
    x_end = 480               # end of the horizontal axis
    mid, amp = 226, 20        # centre of the oscillation (setpoint) and amplitude
    period = 82.5
    x0 = 110
    b.append(arrow(ox, oy, ox, y_top))
    b.append(arrow(ox, oy, x_end, oy))
    b.append(var(80, 190, 'y', '', 15, 'end'))
    b.append(var(490, 280, 't', '', 15, 'start'))

    # Setpoint (dashed) and the sinusoid in BLUE, about four periods.
    b.append(line(ox, mid, 470, mid, DIM, 1.2, '6 4'))
    b.append(var(474, 222, 'w', '', 15, 'start'))
    pts = []
    for i in range(0, 331):
        x = x0 + i
        y = mid - amp * sin(2 * pi * (x - x0) / period)
        pts.append(f'{x:.1f} {y:.1f}')
    b.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{BLUE}" stroke-width="1.8" stroke-linejoin="round"/>')

    # Dimension between two neighbouring peaks: one period T_c.
    p1 = x0 + period / 4
    p2 = p1 + period
    peak_y = mid - amp
    dim_y = 195
    b.append(line(p1, peak_y - 3, p1, dim_y - 2, DIM, 0.8, '2 2'))
    b.append(line(p2, peak_y - 3, p2, dim_y - 2, DIM, 0.8, '2 2'))
    b.append(line(p1, dim_y, p2, dim_y, DIM, 1))
    b.append(head(p1, dim_y, pi, DIM, 6))
    b.append(head(p2, dim_y, 0, DIM, 6))
    b.append(var((p1 + p2) / 2, 188, 'T', 'c', 15, 'middle'))

    # Note at the right: the oscillation appears at the critical gain K_c.
    b.append(note(500, 212, 'trvalé kmity při', 11, 'start', INK))
    b.append(var(500, 232, 'K', 'c', 15, 'start'))

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n')


with open(os.path.join(OUT, 'smycka.svg'), 'w', encoding='utf8', newline='\n') as f:
    f.write(drawing())
print('smycka.svg')
