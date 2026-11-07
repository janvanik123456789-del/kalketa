"""Own drawing for sample R48: a stress element (plane view) and the three Mohr circles of the principal stresses -15, 0 and 100 MPa."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
GREEN = '#2f9e6f'
UNIT = '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 760, 340

TEXT = {
    'cs': {'z': 'σ_z = −15 MPa působí kolmo na nákresnu (tlak)', 'tau': 'τ_max = 57,5 MPa', 'mohr': 'Mohrovy kružnice', 'elem': 'Napjatý bod (pohled v rovině xy)', 'sigma': 'σ [MPa]', 'tmax': 'τ [MPa]'},
    'en': {'z': 'σ_z = −15 MPa acts normal to the page (compression)', 'tau': 'τ_max = 57.5 MPa', 'mohr': 'Mohr circles', 'elem': 'Stressed point (view in the xy plane)', 'sigma': 'σ [MPa]', 'tmax': 'τ [MPa]'},
}


def var(x, y, name, sub='', size=15, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def note(x, y, text, size=11, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def head(x, y, angle, color, size=8):
    a1, a2 = angle + 2.7, angle - 2.7
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.8):
    return line(x1, y1, x2, y2, color, width) + head(x2, y2, atan2(y2 - y1, x2 - x1), color)


def drawing(lang):
    t = TEXT[lang]
    b = []
    # ---- Left: the element with its stresses ----------------------------
    b.append(note(150, 28, t['elem'], 12, 'middle', INK))
    x1, y1, x2, y2 = 100, 120, 200, 220
    b.append(f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" fill="{UNIT}" stroke="{INK}" stroke-width="1.6"/>')
    yc, xc = 170, 150
    # normal stresses sigma_x (left and right), sigma_y (top and bottom): tension, arrows point out
    b.append(arrow(x2, yc, x2 + 50, yc, BLUE))
    b.append(arrow(x1, yc, x1 - 50, yc, BLUE))
    b.append(arrow(xc, y1, xc, y1 - 50, BLUE))
    b.append(arrow(xc, y2, xc, y2 + 50, BLUE))
    b.append(var(x2 + 62, yc + 5, 'σ', 'x', 16, 'start', BLUE))
    b.append(var(xc + 10, y1 - 54, 'σ', 'y', 16, 'start', BLUE))
    # shear tau_xy: right face up, left face down, top face right, bottom face left
    off = 12
    b.append(arrow(x2 + off, y2 - 8, x2 + off, y2 - 42, RED))
    b.append(arrow(x1 - off, y1 + 8, x1 - off, y1 + 42, RED))
    b.append(arrow(x1 + 8, y1 - off, x1 + 42, y1 - off, RED))
    b.append(arrow(x2 - 8, y2 + off, x2 - 42, y2 + off, RED))
    b.append(var(x2 + off + 8, y2 - 22, 'τ', 'xy', 16, 'start', RED))
    # axes
    b.append(arrow(24, 300, 64, 300, DIM, 1.4))
    b.append(arrow(24, 300, 24, 260, DIM, 1.4))
    b.append(var(70, 304, 'x', '', 14, 'start', DIM))
    b.append(var(28, 255, 'y', '', 14, 'start', DIM))
    b.append(note(150, 328, t['z'], 11, 'middle', DIM))

    # ---- Right: three Mohr circles -------------------------------------
    s1, s2, s3 = -15.0, 0.0, 100.0
    ox, base = 380.0, 285.0   # pixel of sigma = 0 and of the sigma axis
    k = 2.55                  # px per MPa
    X = lambda s: ox + k * s
    b.append(note(X(42.5), 28, t['mohr'], 12, 'middle', INK))
    # axes
    b.append(arrow(X(-30), base, X(115), base, DIM, 1.4))
    b.append(note(X(115), base - 8, t['sigma'], 11, 'end', DIM))
    b.append(arrow(X(0), base + 0, X(0), 48, DIM, 1.4))
    b.append(note(X(0) + 6, 52, t['tmax'], 11, 'start', DIM))
    circles = [((s1 + s2) / 2, (s2 - s1) / 2, GREEN), ((s2 + s3) / 2, (s3 - s2) / 2, BLUE), ((s1 + s3) / 2, (s3 - s1) / 2, RED)]
    for c, r, col in circles:
        b.append(f'<path d="M{X(c - r):.1f} {base} A{k * r:.1f} {k * r:.1f} 0 0 1 {X(c + r):.1f} {base}" fill="none" stroke="{col}" stroke-width="2"/>')
    # points on the axis
    for s, name, sub in [(s1, 'σ', '1'), (s2, 'σ', '2'), (s3, 'σ', '3')]:
        b.append(f'<circle cx="{X(s):.1f}" cy="{base}" r="3.5" fill="{INK}"/>')
    b.append(var(X(s1), base + 20, 'σ', '1', 14))
    b.append(var(X(s2) + 12, base + 20, 'σ', '2', 14))
    b.append(var(X(s3), base + 20, 'σ', '3', 14))
    b.append(note(X(s1), base + 34, '−15', 10))
    b.append(note(X(s2) + 12, base + 34, '0', 10))
    b.append(note(X(s3), base + 34, '100', 10))
    # tau_max: top of the big circle
    c, r, _ = circles[2]
    top = base - k * r
    b.append(line(X(c), base, X(c), top, INK, 1.2, '4 3'))
    b.append(f'<circle cx="{X(c):.1f}" cy="{top:.1f}" r="3.5" fill="{RED}"/>')
    b.append(note(X(c) + 10, top - 6, t['tau'], 11, 'start', INK))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n'


for lang, name in (('cs', 'mohr.svg'), ('en', 'mohr.en.svg')):
    with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
        f.write(drawing(lang))
    print(name)
