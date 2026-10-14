"""Own drawings for sample R9 (no third-party pictures): mechanism, forces, assumed steam pressure."""
from math import cos, sin, sqrt, radians, degrees, asin, atan2
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
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


def arrow_head(x, y, angle, color, size=8):
    a1, a2 = angle + radians(155), angle - radians(155)
    return f'<path d="M{x:.1f} {y:.1f} L{x + size * cos(a1):.1f} {y + size * sin(a1):.1f} L{x + size * cos(a2):.1f} {y + size * sin(a2):.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.6):
    return line(x1, y1, x2, y2, color, width) + arrow_head(x2, y2, atan2(y2 - y1, x2 - x1), color, 9)


def dimension(x1, x2, y, label, sub='', color=DIM):
    # A horizontal dimension with arrows at both ends.
    return (line(x1, y, x2, y, color, 1) + arrow_head(x1, y, 3.14159, color, 6) + arrow_head(x2, y, 0, color, 6) + var((x1 + x2) / 2, y - 5, label, sub, 14, color=INK))


def arc(cx, cy, radius, a_from, a_to, color=DIM):
    # Angles in degrees, counterclockwise on paper (SVG y down).
    x1, y1 = cx + radius * cos(radians(a_from)), cy - radius * sin(radians(a_from))
    x2, y2 = cx + radius * cos(radians(a_to)), cy - radius * sin(radians(a_to))
    large = 1 if abs(a_to - a_from) > 180 else 0
    sweep = 0 if a_to > a_from else 1
    return f'<path d="M{x1:.1f} {y1:.1f} A{radius} {radius} 0 {large} {sweep} {x2:.1f} {y2:.1f}" fill="none" stroke="{color}" stroke-width="1"/>'


def hatch(x1, y1, x2, y2, step=7):
    # Hatching of a fixed part (a guide) under a line from x1 to x2.
    out = [line(x1, y1, x2, y1, INK, 1.6)]
    x = x1
    while x < x2:
        out.append(line(x, y1 + (y2 - y1), x + step, y1, DIM, 0.8) if y2 > y1 else line(x, y1, x + step, y2, DIM, 0.8))
        x += step
    return ''.join(out)


def svg(width, height, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}"><rect width="{width}" height="{height}" fill="#ffffff"/>{body}</svg>\n'


# The geometry of the drawing: the proportions of the sheet (o = 5·r), crank at φ = 110°.
R, O, PHI = 60.0, 200.0, 110.0
CX, CY = 520.0, 140.0
ROD = 140.0                     # piston rod from the piston to the crosshead
PW = 16.0                       # piston width


def place(phi):
    p = radians(phi)
    # φ from the dead centre with the crank towards the cylinder, turning clockwise over the top.
    pin = (CX - R * cos(p), CY - R * sin(p))
    cross = CX - (R * cos(p) + sqrt(O**2 - (R * sin(p))**2))
    piston = cross - ROD - PW      # left face of the piston
    return pin, cross, piston


pin, cross, piston = place(PHI)
_, cross0, hu = place(0)        # top dead centre: x = 0
_, _, du = place(180)           # bottom dead centre: x = s
gamma = degrees(asin(R / O * sin(radians(PHI))))
HEAD, TOP, BOT = hu - 30, CY - 38, CY + 38
GLAND = du + PW + 22


def mechanism(with_forces=False):
    b = []
    # Cylinder: head, walls, gland; the chambers H and D either side of the piston.
    b.append(f'<rect x="{HEAD - 10:.1f}" y="{TOP - 10:.1f}" width="10" height="{BOT - TOP + 20:.1f}" fill="#d9dde3" stroke="{INK}" stroke-width="1.4"/>')
    b.append(line(HEAD, TOP, GLAND, TOP))
    b.append(line(HEAD, BOT, GLAND, BOT))
    b.append(f'<rect x="{GLAND:.1f}" y="{TOP:.1f}" width="10" height="{BOT - TOP:.1f}" fill="#d9dde3" stroke="{INK}" stroke-width="1.4"/>')
    b.append(f'<rect x="{HEAD:.1f}" y="{TOP:.1f}" width="{piston - HEAD:.1f}" height="{BOT - TOP:.1f}" fill="{BLUE}" fill-opacity="0.08"/>')
    b.append(f'<rect x="{piston + PW:.1f}" y="{TOP:.1f}" width="{GLAND - piston - PW:.1f}" height="{BOT - TOP:.1f}" fill="{BLUE}" fill-opacity="0.08"/>')
    if not with_forces:
        b.append(var((HEAD + piston) / 2, CY - 6, 'p', 'H'))
        b.append(var((piston + PW + GLAND) / 2, CY - 14, 'p', 'D'))
    b.append(f'<rect x="{piston:.1f}" y="{TOP + 2:.1f}" width="{PW}" height="{BOT - TOP - 4:.1f}" fill="#aab3bf" stroke="{INK}" stroke-width="1.4"/>')
    # Piston rod, crosshead in its guides, connecting rod, crank.
    b.append(line(piston + PW, CY, cross, CY, INK, 4))
    b.append(hatch(cross - 60, CY - 14, cross + 70, CY - 22))
    b.append(hatch(cross - 60, CY + 14, cross + 70, CY + 22))
    b.append(f'<rect x="{cross - 14:.1f}" y="{CY - 13:.1f}" width="28" height="26" rx="3" fill="#cfd5dc" stroke="{INK}" stroke-width="1.4"/>')
    b.append(line(cross, CY, pin[0], pin[1], INK, 3))
    b.append(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="{DIM}" stroke-width="0.8" stroke-dasharray="4 4"/>')
    b.append(line(CX, CY, pin[0], pin[1], INK, 4))
    for (x, y) in [(cross, CY), pin, (CX, CY)]:
        b.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="#ffffff" stroke="{INK}" stroke-width="1.6"/>')
    b.append(f'<path d="M{CX - 12} {CY + 18} L{CX} {CY + 5} L{CX + 12} {CY + 18} Z" fill="none" stroke="{INK}" stroke-width="1.2"/>')
    b.append(hatch(CX - 18, CY + 18, CX + 18, CY + 25, 6))
    # Axis of the mechanism.
    b.append(line(HEAD - 20, CY, CX + R + 25, CY, DIM, 0.8, '10 3 2 3'))
    return b


def drawing_mechanism():
    b = mechanism()
    # Dead centres, the position x and the stroke s.
    for at, name in [(hu, 'HÚ'), (du, 'DÚ')]:
        b.append(line(at, TOP - 18, at, BOT + 62, DIM, 0.9, '4 3'))
        b.append(note(at, TOP - 24, name))
    b.append(dimension(hu, piston, BOT + 26, 'x'))
    b.append(dimension(hu, du, BOT + 54, 's'))
    # Cylinder bore d.
    b.append(line(HEAD - 34, TOP, HEAD - 34, BOT, DIM, 1) + arrow_head(HEAD - 34, TOP, -1.5708, DIM, 6) + arrow_head(HEAD - 34, BOT, 1.5708, DIM, 6))
    b.append(var(HEAD - 44, CY + 5, 'd', anchor='end'))
    # o along the connecting rod, r along the crank.
    mx, my = (cross + pin[0]) / 2, (CY + pin[1]) / 2
    b.append(var(mx - 6, my - 10, 'o'))
    b.append(var((CX + pin[0]) / 2 + 13, (CY + pin[1]) / 2 + 8, 'r'))
    # φ from the axis towards the cylinder, γ between the rod and the axis.
    b.append(arc(CX, CY, 24, 180 - PHI, 180))
    b.append(var(CX - 30, CY - 22, 'φ'))
    b.append(line(CX - R - 18, CY, CX - R - 18, CY, DIM, 0.8))
    b.append(arc(cross, CY, 42, 0, gamma))
    b.append(var(cross + 54, CY - 6, 'γ', size=14))
    return svg(640, 260, ''.join(b))


def drawing_forces():
    b = mechanism(with_forces=True)
    # The resulting force on the piston, the force in the rod and on the guide; at the pin its turning part.
    fp = 70.0
    b.append(arrow(piston - fp, CY + 0.5, piston - 2, CY + 0.5, RED, 2.2))
    b.append(var(piston - fp / 2, CY - 8, 'F', 'p', color=RED))
    g = radians(gamma)
    fl = fp / cos(g)
    ux, uy = (pin[0] - cross) / O, (pin[1] - CY) / O
    b.append(arrow(cross, CY, cross + fl * ux, CY + fl * uy, RED, 2.2))
    b.append(var(cross + fl * ux * 0.55 - 4, CY + fl * uy * 0.55 - 12, 'F', 'l', color=RED))
    fk = fp * sin(g) / cos(g)
    b.append(arrow(cross, CY, cross, CY + fk + 26, RED, 2.2))
    b.append(var(cross + 16, CY + fk + 24, 'F', 'k', color=RED, anchor='start'))
    # At the crank pin: F_l and its part across the crank, F_M = F_l·sin(φ + γ).
    a = radians(PHI + gamma)
    px, py = pin
    b.append(arrow(px, py, px + fl * ux, py + fl * uy, RED, 1.6))
    tx, ty = sin(radians(PHI)), -cos(radians(PHI))    # across the crank, the way it turns
    fm = fl * sin(a)
    b.append(arrow(px, py, px + fm * tx, py + fm * ty, BLUE, 2.2))
    b.append(var(px + fm * tx + 4, py + fm * ty + 20, 'F', 'M', color=BLUE))
    b.append(arc(CX, CY, 22, 180 - PHI, 180))
    b.append(var(CX - 28, CY - 20, 'φ', size=14))
    # The shaft turns clockwise: M_p in that sense.
    q = R + 14
    start, end = radians(25), radians(-50)
    b.append(f'<path d="M{CX + q * cos(start):.1f} {CY - q * sin(start):.1f} A{q} {q} 0 0 1 {CX + q * cos(end):.1f} {CY - q * sin(end):.1f}" fill="none" stroke="{BLUE}" stroke-width="1.4"/>')
    b.append(arrow_head(CX + q * cos(end), CY - q * sin(end), radians(180 - 50 + 90) - radians(180), BLUE, 8))
    b.append(var(CX + q + 6, CY + 30, 'M', 'p', color=BLUE, anchor='start'))
    sub = lambda t: f'<tspan font-size="10" dy="4">{t}</tspan><tspan dy="-4"> </tspan>'
    b.append(f'<text x="{CX - 90:.1f}" y="{CY + R + 38:.1f}" {FONT} font-style="italic" font-size="14" fill="{BLUE}">M{sub("p")}= F{sub("l")}· sin(φ + γ) · r</text>')
    return svg(640, 260, ''.join(b))


def drawing_pressure():
    # The assumed pressure in chamber H over the stroke: admission to ε, expansion p·V = const., exhaust.
    w, h = 640, 270
    left, right, top, bottom = 70, 600, 30, 220
    p1, p2, eps, x0 = 0.8, 0.12, 0.3, 0.1      # MPa; x0 as a share of the stroke
    X = lambda u: left + (right - left) * u
    Y = lambda p: bottom - (bottom - top) * p / 0.9
    b = [line(left, bottom, right + 10, bottom, INK, 1.2), line(left, bottom, left, top - 10, INK, 1.2)]
    b.append(arrow_head(right + 14, bottom, 0, INK, 7) + arrow_head(left, top - 14, -1.5708, INK, 7))
    b.append(var(right + 16, bottom - 8, 'x', anchor='end'))
    b.append(var(left - 10, top - 4, 'p', anchor='end'))
    pts = [(0, p1), (eps, p1)] + [(u / 100, p1 * (eps + x0) / (u / 100 + x0)) for u in range(31, 101)]
    curve = ' '.join(f'{X(u):.1f},{Y(p):.1f}' for u, p in pts)
    back = f'{X(1):.1f},{Y(p2):.1f} {X(0):.1f},{Y(p2):.1f}'
    b.append(f'<polygon points="{curve} {back}" fill="{BLUE}" fill-opacity="0.10" stroke="none"/>')
    b.append(f'<polyline points="{curve}" fill="none" stroke="{BLUE}" stroke-width="2.4" stroke-linejoin="round"/>')
    b.append(line(X(1), Y(pts[-1][1]), X(1), Y(p2), BLUE, 2.4))
    b.append(line(X(1), Y(p2), X(0), Y(p2), BLUE, 2.4, '7 4'))
    b.append(line(X(0), Y(p2), X(0), Y(p1), BLUE, 1.2, '3 3'))
    for p, label, sub in [(p1, 'p', '1'), (p2, 'p', '2')]:
        b.append(line(left - 5, Y(p), left, Y(p), INK, 1.2))
        b.append(var(left - 10, Y(p) + 5, label, sub, anchor='end'))
    b.append(line(X(eps), bottom, X(eps), bottom + 5, INK, 1.2))
    b.append(var(X(eps), bottom + 20, 'ε·s'))
    b.append(line(X(1), bottom, X(1), bottom + 5, INK, 1.2))
    b.append(var(X(1), bottom + 20, 's'))
    b.append(var(X(0), bottom + 20, '0'))
    b.append(note(X(eps / 2), Y(p1) - 8, 'plnění'))
    b.append(note(X(0.62), Y(0.45) - 6, 'expanze p·V = konst.', anchor='start'))
    b.append(note(X(0.5), Y(p2) + 16, 'výfuk (zpětný zdvih)'))
    b.append(note(X(0.5), top - 12, 'komora H; komora D stejně, posunutá o půl otáčky', 11))
    return svg(w, h, ''.join(b))


for name, text in [('mechanismus.svg', drawing_mechanism()), ('sily.svg', drawing_forces()), ('tlak-pary.svg', drawing_pressure())]:
    with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
        f.write(text)
    print(name, len(text))
print('x =', piston - hu, 's =', du - hu, 'gamma =', gamma)
