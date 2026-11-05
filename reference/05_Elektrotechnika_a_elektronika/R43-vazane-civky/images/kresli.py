"""Own drawing for sample R43: two magnetically coupled coils with a source and a load. Symbols only, so one file serves both languages."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
INK, DIM, FILL = '#1f2328', '#5b6470', '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
W, H = 640, 250
TOP, BOT = 50, 200
XS, XC1, XC2, XZ = 60, 280, 360, 580


def line(x1, y1, x2, y2, color=INK, width=1.6):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'


def var(x, y, name, sub='', size=16, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x}" y="{y}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def rect_h(x, y, w=44, h=16):
    return f'<rect x="{x}" y="{y - h / 2}" width="{w}" height="{h}" fill="{FILL}" stroke="{INK}" stroke-width="1.5"/>'


def rect_v(x, y, w=16, h=44):
    return f'<rect x="{x - w / 2}" y="{y}" width="{w}" height="{h}" fill="{FILL}" stroke="{INK}" stroke-width="1.5"/>'


def coil(x, y1, y2, side):
    # Four humps on a vertical line; side +1 bulges right, -1 left.
    step = (y2 - y1) / 4
    d = f'M{x} {y1}'
    for i in range(4):
        d += f' a{step / 2:.1f} {step / 2:.1f} 0 0 {1 if side > 0 else 0} 0 {step:.1f}'
    return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.8"/>'


def down(x1, x2, y, color=INK):
    return line(x1, y, x2 - 6, y, color, 1.4) + f'<path d="M{x2} {y} L{x2 - 8} {y - 4} L{x2 - 8} {y + 4} Z" fill="{color}"/>'


MID = (TOP + BOT) / 2
CT, CB = MID - 42, MID + 42
p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
# Primary mesh with the source on the left.
p += [line(XS, TOP, 118, TOP), rect_h(118, TOP), line(162, TOP, XC1, TOP), line(XC1, TOP, XC1, CT)]
p += [coil(XC1, CT, CB, 1), line(XC1, CB, XC1, BOT), line(XC1, BOT, XS, BOT)]
p += [line(XS, TOP, XS, MID - 18), line(XS, MID + 18, XS, BOT)]
p.append(f'<circle cx="{XS}" cy="{MID}" r="18" fill="{FILL}" stroke="{INK}" stroke-width="1.5"/>')
p.append(f'<text x="{XS}" y="{MID + 6}" {FONT} font-size="20" fill="{INK}" text-anchor="middle">~</text>')
p.append(var(XS - 30, MID + 5, 'U'))
p.append(var(140, TOP - 14, 'R', '1'))
p.append(var(XC1 - 34, MID + 5, 'L', '1'))
# Current arrow in the primary.
p.append(down(190, 228, TOP - 12))
p.append(var(209, TOP - 20, 'I', '1', 15))
# Secondary mesh with the load on the right.
p += [line(XC2, TOP, 418, TOP), rect_h(418, TOP), line(462, TOP, XZ, TOP), line(XC2, TOP, XC2, CT)]
p += [coil(XC2, CT, CB, -1), line(XC2, CB, XC2, BOT), line(XC2, BOT, XZ, BOT)]
p += [line(XZ, TOP, XZ, MID - 22), rect_v(XZ, MID - 22), line(XZ, MID + 22, XZ, BOT)]
p.append(var(440, TOP - 14, 'R', '2'))
p.append(var(XC2 + 34, MID + 5, 'L', '2'))
p.append(var(XZ + 28, MID + 5, 'R', 'z'))
p.append(down(490, 528, TOP - 12))
p.append(var(509, TOP - 20, 'I', '2', 15))
# Dots of the windings and the coupling between them.
p.append(f'<circle cx="{XC1 - 12}" cy="{CT - 6}" r="3" fill="{INK}"/>')
p.append(f'<circle cx="{XC2 + 12}" cy="{CT - 6}" r="3" fill="{INK}"/>')
p.append(line(XC1 + 22, CT - 2, XC1 + 22, CB + 2, DIM, 1.2))
p.append(line(XC2 - 22, CT - 2, XC2 - 22, CB + 2, DIM, 1.2))
p.append(var((XC1 + XC2) / 2, CT - 14, 'M', '', 16, 'middle', DIM))
p.append('</svg>\n')
with open(os.path.join(OUT, 'schema.svg'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(''.join(p))
