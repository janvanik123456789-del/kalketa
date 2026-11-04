"""Own drawing for sample R37: a series-parallel RLC circuit. Source E, capacitor C_1 in series, then the resistor R in parallel with the branch L - C_2. Marks after IEC 60617."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 670, 300
SHIFT = 85
TOP, BOT = 70, 250        # y of the upper and lower wire
XA, XB = 270, 270         # nodes A (top) and B (bottom)
X_R, X_LC = 340, 480      # x of the two parallel branches

WORDS = {
    'cs': {'src': '(ef.), 60 Hz', 'file': 'schema.svg'},
    'en': {'src': '(rms), 60 Hz', 'file': 'schema.en.svg'},
}


def var(x, y, name, sub='', size=15, anchor='middle', color=INK, style='italic'):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="{style}" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def label(x, y, name, sub, value, anchor='middle', color=INK):
    """Italic quantity with a subscript, then the value upright."""
    sub_part = f'<tspan font-size="10.8" dy="4">{sub}</tspan><tspan dy="-4"> </tspan>' if sub else ''
    return (f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="14" fill="{color}" text-anchor="{anchor}">'
            f'<tspan font-style="italic">{name}</tspan>{sub_part}<tspan> = {value}</tspan></text>')


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.5, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=7):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.4):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def dot(x, y):
    return f'<circle cx="{x}" cy="{y}" r="3.5" fill="{INK}"/>'


def resistor_v(x, y_mid):
    """Rectangle 10 x 30 centred at (x, y_mid)."""
    return f'<rect x="{x - 5}" y="{y_mid - 15}" width="10" height="30" fill="#ffffff" stroke="{INK}" stroke-width="1.5"/>'


def capacitor_h(x, y):
    """Two parallel plates, wire horizontal."""
    return (line(x - 4, y - 12, x - 4, y + 12, INK, 2) + line(x + 4, y - 12, x + 4, y + 12, INK, 2))


def capacitor_v(x, y):
    return (line(x - 12, y - 4, x + 12, y - 4, INK, 2) + line(x - 12, y + 4, x + 12, y + 4, INK, 2))


def coil_v(x, y_mid):
    """Row of four half-circles along a vertical wire, 40 px long."""
    y0 = y_mid - 20
    path = f'M{x} {y0}' + ''.join(f' a5 5 0 0 1 0 10' for _ in range(4))
    return f'<path d="{path}" fill="none" stroke="{INK}" stroke-width="1.5"/>'


def source(x, y_mid):
    cy = y_mid
    return (f'<circle cx="{x}" cy="{cy}" r="22" fill="#ffffff" stroke="{INK}" stroke-width="1.5"/>'
            f'<path d="M{x - 12} {cy} q 6 -12 12 0 t 12 0" fill="none" stroke="{INK}" stroke-width="1.3"/>')


def drawing(lang):
    w = WORDS[lang]
    b = []
    xs = 70
    mid = (TOP + BOT) // 2

    # Source on the left, wires.
    b.append(line(xs, TOP, xs, mid - 22))
    b.append(line(xs, mid + 22, xs, BOT))
    b.append(source(xs, mid))
    b.append(line(xs, TOP, 170 - 4, TOP))
    b.append(capacitor_h(170, TOP))
    b.append(line(170 + 4, TOP, XA, TOP))
    b.append(line(xs, BOT, X_LC, BOT))
    b.append(line(XA, TOP, X_LC, TOP))

    # Nodes.
    b.append(dot(XA, TOP))
    b.append(dot(XB, BOT))

    # Branch 1: resistor R.
    b.append(line(X_R, TOP, X_R, mid - 15))
    b.append(resistor_v(X_R, mid))
    b.append(line(X_R, mid + 15, X_R, BOT))
    b.append(dot(X_R, TOP))
    b.append(dot(X_R, BOT))

    # Branch 2: coil L and capacitor C_2 in series.
    b.append(line(X_LC, TOP, X_LC, mid - 45))
    b.append(coil_v(X_LC, mid - 25))
    b.append(line(X_LC, mid - 5, X_LC, mid + 26))
    b.append(capacitor_v(X_LC, mid + 30))
    b.append(line(X_LC, mid + 34, X_LC, BOT))
    b.append(dot(X_LC, TOP))
    b.append(dot(X_LC, BOT))

    # Labels of the elements.
    b.append(label(xs - 30, mid - 6, 'E', '', '120 V', 'end'))
    b.append(note(xs - 30, mid + 14, w['src'], 11, 'end', INK))
    b.append(label(170, TOP - 22, 'C', '1', '4,7 μF' if lang == 'cs' else '4.7 μF'))
    b.append(label(X_R - 14, mid + 5, 'R', '', '470 Ω', 'end'))
    b.append(label(X_LC + 14, mid - 20, 'L', '', '650 mH', 'start'))
    b.append(label(X_LC + 14, mid + 34, 'C', '2', '1,5 μF' if lang == 'cs' else '1.5 μF', 'start'))

    # Nodes names.
    b.append(var(XA - 8, TOP - 10, 'A', anchor='end'))
    b.append(var(XB - 8, BOT + 20, 'B', anchor='end'))

    # Currents: I in the top wire after the source, I_R and I_LC2 in the branches.
    b.append(arrow(100, TOP - 8, 135, TOP - 8, BLUE))
    b.append(var(118, TOP - 14, 'I', color=BLUE))
    b.append(arrow(X_R + 14, TOP + 18, X_R + 14, TOP + 48, BLUE))
    b.append(var(X_R + 26, TOP + 38, 'I', 'R', color=BLUE, anchor='start'))
    b.append(arrow(X_LC - 14, TOP + 12, X_LC - 14, TOP + 38, BLUE))
    b.append(var(X_LC - 24, TOP + 30, 'I', 'LC2', color=BLUE, anchor='end'))

    # Voltages: E_C1 across C_1 and E_p between A and B.
    b.append(arrow(150, TOP + 24, 190, TOP + 24, RED))
    b.append(var(170, TOP + 46, 'E', 'C1', color=RED))
    b.append(f'<path d="M{XA - 22} {TOP + 20} Q{XA - 34} {mid} {XA - 22} {BOT - 20}" fill="none" stroke="{RED}" stroke-width="1.3"/>')
    b.append(head(XA - 22, BOT - 20, atan2(40, 12) + 0.2, RED))
    b.append(var(XA - 38, mid + 5, 'E', 'p', color=RED, anchor='end'))

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 0 {W + 70} {H}" width="{W + 70}" height="{H}">'
            f'<rect x="-70" width="{W + 70}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n')


for lang, w in WORDS.items():
    with open(os.path.join(OUT, w['file']), 'w', encoding='utf8', newline='\n') as f:
        f.write(drawing(lang))
    print(w['file'])
