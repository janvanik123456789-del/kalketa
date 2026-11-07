"""Own drawings for sample R49: the square wall of two triangular elements (task) and its deformed shape magnified 5000 times. Symbols only, so one file serves both languages."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
INK, DIM, RED, BLUE, FILL = '#1f2328', '#5b6470', '#a12828', '#2a78d6', '#e9ecef'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
W, H = 480, 390
X0, Y0, S = 130.0, 340.0, 230.0   # node 1 in px and the side of the square


def px(x, y):
    return X0 + S * x, Y0 - S * y


def line(x1, y1, x2, y2, color=INK, width=1.5, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def var(x, y, name, sub='', color=INK, size=16, anchor='middle'):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def num(x, y, text, color=INK, size=16, anchor='middle'):
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def head(x, y, dx, dy, color, size=9):
    # Arrow head at (x, y) for an arrow pointing along (dx, dy), a unit vector.
    bx, by = x - dx * size, y - dy * size
    nx, ny = -dy * size * 0.45, dx * size * 0.45
    return f'<path d="M{x:.1f} {y:.1f} L{bx + nx:.1f} {by + ny:.1f} L{bx - nx:.1f} {by - ny:.1f} Z" fill="{color}"/>'


def arrow(x1, y1, x2, y2, color=INK, width=1.8):
    n = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    ux, uy = (x2 - x1) / n, (y2 - y1) / n
    return line(x1, y1, x2 - ux * 6, y2 - uy * 6, color, width) + head(x2, y2, ux, uy, color)


def pin(x, y):
    out = f'<path d="M{x:.1f} {y:.1f} L{x - 13:.1f} {y + 20:.1f} L{x + 13:.1f} {y + 20:.1f} Z" fill="{FILL}" stroke="{INK}" stroke-width="1.5"/>'
    out += line(x - 20, y + 20, x + 20, y + 20)
    for s in range(-16, 19, 8):
        out += line(x + s, y + 20, x + s - 5, y + 27, DIM, 1.0)
    return out


def node(x, y):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{INK}"/>'


def ring(x, y, text):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="#ffffff" stroke="{DIM}" stroke-width="1.2"/>' + num(x, y + 5.5, text, DIM, 14)


def axes():
    ax, ay = 36.0, 250.0
    return (arrow(ax, ay, ax + 44, ay, DIM, 1.3) + arrow(ax, ay, ax, ay - 44, DIM, 1.3)
            + var(ax + 52, ay + 5, 'x', '', DIM, 15) + var(ax, ay - 52, 'y', '', DIM, 15))


def poly(pts, **kw):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{body}</svg>\n'


def task():
    n = [px(0, 0), px(1, 0), px(1, 1), px(0, 1)]
    b = []
    b.append(f'<polygon points="{poly(n)}" fill="{FILL}" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/>')
    b.append(line(*n[1], *n[3], INK, 2.0))
    b.append(pin(*n[0]) + pin(*n[1]))
    for p in n:
        b.append(node(*p))
    # Node numbers, outside the corners.
    b.append(num(n[0][0] - 16, n[0][1] + 6, '1'))
    b.append(num(n[1][0] + 18, n[1][1] + 6, '2'))
    b.append(num(n[2][0] + 14, n[2][1] - 10, '3'))
    b.append(num(n[3][0] - 16, n[3][1] - 8, '4'))
    # Element numbers in circles at the centres of the triangles.
    b.append(ring(X0 + S / 3, Y0 - S / 3, '1'))
    b.append(ring(X0 + 2 * S / 3, Y0 - 2 * S / 3, '2'))
    # Loads: F_x3 to the left at node 3, F_y4 down at node 4.
    b.append(arrow(n[2][0] + 78, n[2][1], n[2][0] + 5, n[2][1], RED, 2.2))
    b.append(var(n[2][0] + 44, n[2][1] - 9, 'F', 'x3', RED))
    b.append(arrow(n[3][0], n[3][1] - 62, n[3][0], n[3][1] - 5, RED, 2.2))
    b.append(var(n[3][0] + 14, n[3][1] - 40, 'F', 'y4', RED, anchor='start'))
    b.append(axes())
    return svg(''.join(b))


def deformed():
    scale = 5000.0
    u = {3: (-28.434782608695652e-6, 3.3913043478260856e-6), 4: (-19.82608695652174e-6, -20.86956521739131e-6)}
    orig = {1: (0, 0), 2: (1, 0), 3: (1, 1), 4: (0, 1)}
    now = {k: (v[0] + u.get(k, (0, 0))[0] * scale, v[1] + u.get(k, (0, 0))[1] * scale) for k, v in orig.items()}
    po = [px(*orig[k]) for k in (1, 2, 3, 4)]
    pn = [px(*now[k]) for k in (1, 2, 3, 4)]
    b = []
    b.append(f'<polygon points="{poly(po)}" fill="{FILL}" stroke="{DIM}" stroke-width="1.6"/>')
    b.append(line(*po[1], *po[3], DIM, 1.4))
    b.append(pin(*po[0]) + pin(*po[1]))
    b.append(f'<polygon points="{poly(pn)}" fill="none" stroke="{BLUE}" stroke-width="2.2" stroke-dasharray="7 4" stroke-linejoin="round"/>')
    b.append(line(*pn[1], *pn[3], BLUE, 2.0, '7 4'))
    for p in pn:
        b.append(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="3.5" fill="{BLUE}"/>')
    b.append(num(po[0][0] - 16, po[0][1] + 6, '1'))
    b.append(num(po[1][0] + 18, po[1][1] + 6, '2'))
    b.append(num(pn[2][0] + 16, pn[2][1] - 8, '3', BLUE))
    b.append(num(pn[3][0] - 16, pn[3][1] - 8, '4', BLUE))
    b.append(num(W - 20, 30, '5000×', DIM, 16, 'end'))
    b.append(axes())
    return svg(''.join(b))


for name, text in (('stena.svg', task()), ('deformace.svg', deformed())):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print(name)
