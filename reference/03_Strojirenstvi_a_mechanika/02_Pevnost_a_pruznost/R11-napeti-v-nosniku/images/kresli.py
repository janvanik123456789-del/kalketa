"""Own drawings for sample R11: the beam with its loads, the two cross sections, the stress over the height."""
from math import atan2, cos, sin
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
STEEL = '#b9c1cc'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""


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


def hdim(x1, x2, y, label, sub=''):
    return line(x1, y, x2, y, DIM, 1) + head(x1, y, 3.14159, DIM, 6) + head(x2, y, 0, DIM, 6) + var((x1 + x2) / 2, y - 5, label, sub, 14)


def vdim(x, y1, y2, label, sub='', side='end'):
    dx = -8 if side == 'end' else 8
    return line(x, y1, x, y2, DIM, 1) + head(x, y1, -1.5708, DIM, 6) + head(x, y2, 1.5708, DIM, 6) + var(x + dx, (y1 + y2) / 2 + 5, label, sub, 14, anchor=side)


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#ffffff"/>{body}</svg>\n'


def support(x, y, rolling):
    # A pin (triangle) or a roller (triangle on a line with a gap).
    out = [f'<path d="M{x} {y} L{x - 12} {y + 18} L{x + 12} {y + 18} Z" fill="#ffffff" stroke="{INK}" stroke-width="1.5"/>']
    base = y + 18 + (6 if rolling else 0)
    if rolling:
        out.append(line(x - 14, y + 21, x + 14, y + 21, INK, 1.2))
    for k in range(-16, 16, 6):
        out.append(line(x + k, base + 6, x + k + 6, base, DIM, 0.8))
    out.append(line(x - 18, base, x + 18, base, INK, 1.4))
    return ''.join(out)


def drawing_beam():
    w, h = 640, 300
    left, right, y = 60, 580, 150
    scale = (right - left) / 5.0
    x1, x2, xs = left + scale * 5 / 4, left + scale * 10 / 3, left + scale * 5 / 3
    b = [f'<rect x="{left}" y="{y - 8}" width="{right - left}" height="16" fill="{STEEL}" stroke="{INK}" stroke-width="1.6"/>']
    b.append(support(left, y + 8, False))
    b.append(support(right, y + 8, True))
    # Loads down, reactions up.
    b.append(arrow(x1, y - 70, x1, y - 10, RED, 2.2) + var(x1 + 10, y - 52, 'F', '1', color=RED, anchor='start'))
    b.append(arrow(x2, y - 90, x2, y - 10, RED, 2.2) + var(x2 + 10, y - 70, 'F', '2', color=RED, anchor='start'))
    b.append(arrow(left - 26, y + 70, left - 26, y + 6, BLUE, 2.2) + var(left - 34, y + 46, 'V', '1', color=BLUE, anchor='end'))
    b.append(arrow(right + 26, y + 70, right + 26, y + 6, BLUE, 2.2) + var(right + 34, y + 46, 'V', '2', color=BLUE, anchor='start'))
    # The cut at a third of the length.
    b.append(line(xs, y - 40, xs, y + 40, INK, 1.2, '6 4'))
    b.append(note(xs + 6, y + 54, 'řez v l/3', 11, 'start'))
    # Dimensions from the left support.
    b.append(line(x1, y + 12, x1, y + 82, DIM, 0.6) + line(x2, y + 12, x2, y + 104, DIM, 0.6) + line(right, y + 34, right, y + 126, DIM, 0.6))
    b.append(hdim(left, x1, y + 78, 'x', '1'))
    b.append(hdim(left, x2, y + 100, 'x', '2'))
    b.append(hdim(left, right, y + 122, 'l'))
    # Axes x along the beam, y up.
    b.append(arrow(left, y - 90, left + 40, y - 90, INK, 1.2) + var(left + 48, y - 86, 'x', anchor='start'))
    b.append(arrow(left, y - 90, left, y - 125, INK, 1.2) + var(left - 6, y - 118, 'y', anchor='end'))
    return svg(w, h, ''.join(b))


def section(cx, cy, a, b, label, scale):
    wa, hb = a * scale, b * scale
    out = [f'<rect x="{cx - wa / 2:.1f}" y="{cy - hb / 2:.1f}" width="{wa:.1f}" height="{hb:.1f}" fill="{STEEL}" stroke="{INK}" stroke-width="1.6"/>']
    out.append(line(cx - wa / 2 - 18, cy, cx + wa / 2 + 18, cy, DIM, 0.9, '10 3 2 3'))
    out.append(line(cx, cy - hb / 2 - 14, cx, cy + hb / 2 + 14, DIM, 0.9, '10 3 2 3'))
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{INK}"/>')
    out.append(hdim(cx - wa / 2, cx + wa / 2, cy + hb / 2 + 24, 'a', label))
    out.append(vdim(cx + wa / 2 + 30, cy - hb / 2, cy + hb / 2, 'b', label, 'start'))
    return ''.join(out)


def drawing_sections():
    w, h = 640, 270
    scale = 800
    b = [section(190, 120, 0.1, 0.2, '1', scale), section(450, 120, 0.2, 0.1, '2', scale)]
    b.append(note(190, 250, 'průřez 1: I₁ = a₁·b₁³/12'))
    b.append(note(450, 250, 'průřez 2: I₂ = a₂·b₂³/12'))
    b.append(note(325, 116, 'neutrální osa', 11))
    return svg(w, h, ''.join(b))


def drawing_stress():
    # The second section seen from the side, the stress over its height: compression above, tension below.
    w, h = 520, 260
    cx, cy, hb = 150, 130, 160
    b = [f'<rect x="{cx - 30}" y="{cy - hb / 2}" width="60" height="{hb}" fill="{STEEL}" stroke="{INK}" stroke-width="1.6"/>']
    b.append(line(cx - 60, cy, 470, cy, DIM, 0.9, '10 3 2 3'))
    b.append(arrow(cx - 50, cy + hb / 2 + 10, cx - 50, cy - hb / 2 - 20, INK, 1.2) + var(cx - 58, cy - hb / 2 - 12, 'y', anchor='end'))
    b.append(var(cx - 58, cy + 5, '0', anchor='end'))
    # The stress line: from −σ at the top to +σ at the bottom, zero at the centroid.
    base, reach = 330, 110
    top, bottom = cy - hb / 2, cy + hb / 2
    b.append(line(base, top, base, bottom, INK, 1.4))
    b.append(f'<path d="M{base} {top} L{base - reach} {top} L{base + reach} {bottom} L{base} {bottom} Z" fill="none" stroke="none"/>')
    b.append(f'<path d="M{base} {cy} L{base - reach} {top} L{base} {top} Z" fill="{BLUE}" fill-opacity="0.18" stroke="{BLUE}" stroke-width="1.6"/>')
    b.append(f'<path d="M{base} {cy} L{base + reach} {bottom} L{base} {bottom} Z" fill="{RED}" fill-opacity="0.18" stroke="{RED}" stroke-width="1.6"/>')
    for k in range(1, 5):
        yy = top + (cy - top) * (k - 0.5) / 4
        b.append(arrow(base - reach * (cy - yy) / (cy - top), yy, base - 2, yy, BLUE, 1.1))
        yy2 = cy + (bottom - cy) * (k - 0.5) / 4
        b.append(arrow(base, yy2, base + reach * (yy2 - cy) / (bottom - cy) - 2, yy2, RED, 1.1))
    b.append(note(base - reach - 6, top + 4, 'tlak', 12, 'end', BLUE))
    b.append(note(base + reach + 6, bottom + 4, 'tah', 12, 'start', RED))
    b.append(var(base - reach / 2, top - 8, 'σ', 'h', color=BLUE))
    b.append(var(base + reach / 2, bottom + 22, 'σ', 'd', color=RED))
    b.append(note(base + 8, cy - 6, 'σ = 0', 11, 'start'))
    return svg(w, h, ''.join(b))


for name, text in [('nosnik.svg', drawing_beam()), ('prurezy.svg', drawing_sections()), ('napeti.svg', drawing_stress())]:
    with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
        f.write(text)
    print(name)
